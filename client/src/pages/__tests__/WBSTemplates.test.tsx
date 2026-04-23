import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import WBSTemplates from '../WBSTemplates'
import { useStore } from '@/hooks/useStore'

const { toastMock, navigateMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
  navigateMock: vi.fn(),
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: vi.fn(),
  }
})

const mockedUseNavigate = vi.mocked(useNavigate)

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitForText(container: HTMLElement, expected: string[]) {
  const deadline = Date.now() + 2500

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

async function waitForCondition(condition: () => boolean) {
  const deadline = Date.now() + 2500

  while (Date.now() < deadline) {
    let matched = false
    await act(async () => {
      await flush()
      matched = condition()
    })

    if (matched) return
  }

  throw new Error('Condition not met within timeout')
}

function findButton(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll('button')).find((button) =>
    button.textContent?.includes(label),
  ) as HTMLButtonElement | undefined
}

function buildTemplateNode(name: string, children: Array<{ name: string; reference_days: number }> = []) {
  return {
    name,
    reference_days: children.length > 0 ? children.reduce((sum, child) => sum + child.reference_days, 0) : 10,
    children,
  }
}

describe('WBSTemplates planning entry', () => {
  const projectId = 'project-1'
  const projectName = '示例项目'
  let container: HTMLDivElement
  let root: Root | null = null
  const fetchMock = vi.fn()

  beforeEach(() => {
    toastMock.mockReset()
    navigateMock.mockReset()
    mockedUseNavigate.mockReturnValue(navigateMock)

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    useStore.setState({
      currentProject: {
        id: projectId,
        name: projectName,
        status: '进行中',
        current_phase: 'construction',
        default_wbs_generated: false,
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

      if (url.includes('/api/planning/wbs-templates/bootstrap/context')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              mode: 'ongoing_project_to_baseline',
              project_id: projectId,
              checklist: [
                { key: 'scan', title: '先看现状', detail: '识别当前执行到哪一步' },
                { key: 'bootstrap', title: '自动补基线', detail: '自动补建初始基线，不用手工一条条录' },
                { key: 'review', title: '确认映射', detail: '把待确认项补齐后再正式启用' },
              ],
            },
          }),
        } as never
      }

      if (url.includes('/api/projects')) {
        return {
          ok: true,
          json: async () => ({ success: true, data: [] }),
        } as never
      }

      if (url.includes('/api/planning/wbs-templates/bootstrap/from-ongoing-project')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              path: 'ongoing_project_to_baseline',
              project_id: projectId,
              needs_mapping_review: true,
              baseline: { id: 'baseline-1', project_id: projectId, version: 1 },
              created_item_count: 3,
            },
          }),
        } as never
      }

      if (url.includes('/api/planning/wbs-templates')) {
        return {
          ok: true,
          json: async () => ({ success: true, data: [] }),
        } as never
      }

      throw new Error(`Unexpected fetch url: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    vi.mocked(window.localStorage.getItem).mockImplementation(() => null)
    vi.mocked(window.localStorage.setItem).mockImplementation(() => undefined)
    vi.mocked(window.localStorage.removeItem).mockImplementation(() => undefined)
    vi.mocked(window.localStorage.clear).mockImplementation(() => undefined)
  })

  afterEach(() => {
    fetchMock.mockReset()
    toastMock.mockReset()
    navigateMock.mockReset()
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

  it('renders the planning route directly, fetches the new planning WBS API, and routes ongoing projects to baseline', async () => {
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/planning/wbs-templates`]}>
          <Routes>
            <Route path="/projects/:id/planning/wbs-templates" element={<WBSTemplates />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForText(container, ['计划编制', 'WBS 模板', '了解更多', '四层时间线'])

    expect(container.textContent).toContain('在建项目一键启用')
    expect(container.textContent).toContain('自动补建初始基线')
    expect(container.textContent).not.toContain('独立主模块')

    const ongoingButton = findButton(container, '在建项目一键启用')
    expect(ongoingButton).toBeTruthy()

    await act(async () => {
      ongoingButton?.click()
      await flush()
    })

    await waitForCondition(
      () =>
        navigateMock.mock.calls.length > 0 &&
        toastMock.mock.calls.some(([payload]) =>
          String(payload?.description ?? '').includes('还有映射待确认项'),
        ),
    )

    expect(navigateMock).toHaveBeenCalledWith(`/projects/${projectId}/planning/baseline`)
    expect(
      toastMock.mock.calls.some(([payload]) =>
        String(payload?.description ?? '').includes('还有映射待确认项'),
      ),
    ).toBe(true)

    const requestedUrls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(requestedUrls.some((url) => url.includes('/api/planning/wbs-templates/bootstrap/context'))).toBe(true)
    expect(requestedUrls.some((url) => url.includes('/api/planning/wbs-templates'))).toBe(true)
    expect(requestedUrls.some((url) => url.includes('/api/wbs-templates'))).toBe(false)
  })

  it('requires an explicit template selection before generating a baseline from WBS templates', async () => {
    useStore.setState({
      currentProject: {
        id: projectId,
        name: projectName,
        status: 'planning',
        current_phase: 'planning',
        default_wbs_generated: false,
      } as never,
    } as never)

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/planning/wbs-templates/bootstrap/context')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              mode: 'template_to_baseline',
              project_id: projectId,
              checklist: [
                { key: 'pick', title: '选择模板', detail: '先选一套模板再生成项目基线' },
              ],
            },
          }),
        } as never
      }

      if (url.includes('/api/planning/wbs-templates')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [
              {
                id: 'template-1',
                name: '标准模板',
                description: '可复用结构',
                template_type: '通用',
                node_count: 8,
                reference_days: 30,
              },
            ],
          }),
        } as never
      }

      if (url.includes('/api/wbs-template-governance/template-1/reference-days')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              template_id: 'template-1',
              template_name: '标准模板',
              updated_count: 0,
              nodes: [],
              feedback: {
                completed_project_count: 0,
                sample_task_count: 0,
                node_count: 1,
              },
            },
          }),
        } as never
      }

      throw new Error(`Unexpected fetch url: ${url}`)
    })

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/planning/wbs-templates`]}>
          <Routes>
            <Route path="/projects/:id/planning/wbs-templates" element={<WBSTemplates />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForText(container, ['计划编制', 'WBS 模板', '选择模板后生成'])

    const templateButton = findButton(container, '选择模板后生成')
    expect(templateButton).toBeTruthy()

    await act(async () => {
      templateButton?.click()
      await flush()
    })

    await waitForCondition(() =>
      toastMock.mock.calls.some(([payload]) =>
        String(payload?.description ?? '').includes('请先在下方选择一套模板'),
      ),
    )

    expect(
      toastMock.mock.calls.some(([payload]) =>
        String(payload?.description ?? '').includes('请先在下方选择一套模板'),
      ),
    ).toBe(true)
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/bootstrap/from-template')),
    ).toBe(false)
  })

  it('shows the quality panel for non-completed projects, but keeps completed-project generation disabled when no samples exist', async () => {
    useStore.setState({
      currentProject: {
        id: projectId,
        name: projectName,
        status: '进行中',
        current_phase: 'construction',
        default_wbs_generated: false,
      } as never,
    } as never)

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/planning/wbs-templates/bootstrap/context')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              mode: 'ongoing_project_to_baseline',
              project_id: projectId,
              checklist: [],
            },
          }),
        } as never
      }

      if (url.includes('/api/planning/wbs-templates?project_id=')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [
              {
                id: 'template-live',
                name: '施工阶段模板',
                description: '进行中项目查看模板',
                template_type: '住宅',
                node_count: 3,
                reference_days: 30,
                template_data: [buildTemplateNode('主体结构', [{ name: '标准层结构循环', reference_days: 10 }])],
              },
            ],
          }),
        } as never
      }

      if (url.includes('/api/wbs-template-governance/template-live/reference-days')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              template_id: 'template-live',
              template_name: '施工阶段模板',
              updated_count: 0,
              nodes: [],
              feedback: {
                completed_project_count: 0,
                sample_task_count: 0,
                node_count: 3,
              },
            },
          }),
        } as never
      }

      throw new Error(`Unexpected fetch url: ${url}`)
    })

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/planning/wbs-templates`]}>
          <Routes>
            <Route path="/projects/:id/planning/wbs-templates" element={<WBSTemplates />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForCondition(() => Boolean(container.querySelector('[data-testid="wbs-template-quality-panel"]')))
    expect(container.textContent).toContain('当前还没有已完成项目样本参与校准')

    const generateButton = container.querySelector('[data-testid="wbs-template-generate-from-completed"]') as HTMLButtonElement | null
    const applyButton = container.querySelector('[data-testid="wbs-template-apply-feedback"]') as HTMLButtonElement | null

    expect(generateButton).toBeTruthy()
    expect(generateButton?.disabled).toBe(true)
    expect(applyButton).toBeTruthy()
    expect(applyButton?.disabled).toBe(true)
  })

  it('renders four built-in engineering template types and keeps the quality panel aligned with the selected template', async () => {
    useStore.setState({
      currentProject: {
        id: projectId,
        name: projectName,
        status: '已完成',
        current_phase: 'completed',
        default_wbs_generated: true,
      } as never,
    } as never)

    const publicBuildingNodes = [
      buildTemplateNode('场地准备与测量', [{ name: '场地平整与临设布置', reference_days: 8 }]),
      buildTemplateNode('基础与地下结构', [{ name: '桩基/筏板及承台基础', reference_days: 24 }]),
      buildTemplateNode('主体结构', [{ name: '主体框架/框剪结构施工', reference_days: 124 }]),
      buildTemplateNode('机电安装', [{ name: '暖通空调与防排烟', reference_days: 34 }]),
      buildTemplateNode('专项系统与功能用房', [{ name: '实验室/诊室/教室等功能房配套', reference_days: 34 }]),
      buildTemplateNode('调试验收与移交', [{ name: '消防、电梯、节能等专项验收', reference_days: 16 }]),
    ]

    const templateList = [
      {
        id: 'template-public',
        name: '公共建筑（学校/医院）WBS模板',
        description: '学校、医院及其他公共建筑工程模板',
        template_type: '公共建筑',
        node_count: 18,
        reference_days: 794,
        template_data: publicBuildingNodes,
      },
      {
        id: 'template-residential',
        name: '高层住宅（地库+塔楼）WBS模板',
        description: '住宅交付关键路径模板',
        template_type: '住宅',
        node_count: 24,
        reference_days: 810,
        template_data: [buildTemplateNode('主体结构', [{ name: '塔楼标准层结构循环', reference_days: 128 }])],
      },
      {
        id: 'template-commercial',
        name: '商业办公综合体（塔楼+裙房）WBS模板',
        description: '商业办公综合体模板',
        template_type: '商业',
        node_count: 22,
        reference_days: 842,
        template_data: [buildTemplateNode('地上主体结构', [{ name: '塔楼核心筒/框架结构', reference_days: 112 }])],
      },
      {
        id: 'template-industrial',
        name: '钢结构厂房/仓储WBS模板',
        description: '钢结构厂房模板',
        template_type: '工业',
        node_count: 17,
        reference_days: 426,
        template_data: [buildTemplateNode('钢结构主体与围护', [{ name: '钢柱钢梁与支撑系统安装', reference_days: 34 }])],
      },
    ]

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/api/planning/wbs-templates/bootstrap/context')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              guide: {
                mode: 'completed_project_to_template',
                project_id: projectId,
                title: '计划编制启用与 WBS 模板',
                subtitle: 'completed project',
                quickActions: [],
                checklist: [],
                learnMore: { title: '四层时间线', sections: [] },
              },
            },
          }),
        } as never
      }

      if (url.includes('/api/planning/wbs-templates?project_id=')) {
        return {
          ok: true,
          json: async () => ({ success: true, data: templateList }),
        } as never
      }

      if (url.includes('/api/wbs-template-governance/template-public/reference-days')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              template_id: 'template-public',
              template_name: '公共建筑（学校/医院）WBS模板',
              updated_count: 0,
              nodes: [],
              feedback: {
                completed_project_count: 3,
                sample_task_count: 42,
                node_count: 18,
              },
            },
          }),
        } as never
      }

      if (url.includes('/api/wbs-template-governance/template-commercial/reference-days')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              template_id: 'template-commercial',
              template_name: '商业办公综合体（塔楼+裙房）WBS模板',
              updated_count: 0,
              nodes: [],
              feedback: {
                completed_project_count: 4,
                sample_task_count: 56,
                node_count: 22,
              },
            },
          }),
        } as never
      }

      throw new Error(`Unexpected fetch url: ${url}`)
    })

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/planning/wbs-templates`]}>
          <Routes>
            <Route path="/projects/:id/planning/wbs-templates" element={<WBSTemplates />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForText(container, [
      '公共建筑（学校/医院）WBS模板',
      '高层住宅（地库+塔楼）WBS模板',
      '商业办公综合体（塔楼+裙房）WBS模板',
      '钢结构厂房/仓储WBS模板',
    ])

    expect(container.textContent).toContain('公共建筑')
    expect(container.textContent).toContain('住宅')
    expect(container.textContent).toContain('商业')
    expect(container.textContent).toContain('工业')

    await waitForCondition(() => (container.textContent || '').includes('缺少标准工序节点'))
    expect(container.textContent).toContain('公共建筑（学校/医院）WBS模板 · 公共建筑')
    const missingMetric = container.querySelector('[data-testid="wbs-template-quality-missing-standard-steps"]')
    expect(missingMetric?.textContent).toContain('0')

    const commercialCard = container.querySelector('[data-testid="wbs-template-card-template-commercial"]') as HTMLDivElement | null
    expect(commercialCard).toBeTruthy()

    await act(async () => {
      commercialCard?.click()
      await flush()
    })

    await waitForCondition(() =>
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes('/api/wbs-template-governance/template-commercial/reference-days'),
      ),
    )

    expect(container.textContent).toContain('商业办公综合体（塔楼+裙房）WBS模板 · 商业')
    const selectedCommercialCard = container.querySelector('[data-testid="wbs-template-card-template-commercial"]')
    expect(selectedCommercialCard?.textContent).toContain('当前查看模板')
  })
})
