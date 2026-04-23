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

describe('WBSTemplate governance panel', () => {
  const projectId = 'project-completed'
  const projectName = '已完成样例项目'
  const templateId = 'template-1'
  const generatedTemplateId = 'template-2'
  const generatedTemplateName = '新沉淀模板'
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
        status: 'completed',
        current_phase: 'delivery',
        default_wbs_generated: true,
      } as never,
      projects: [] as never,
      tasks: [] as never,
      risks: [] as never,
      milestones: [] as never,
      conditions: [] as never,
      obstacles: [] as never,
    })

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/api/planning/wbs-templates/bootstrap/context')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              guide: {
                project_id: projectId,
                project_name: projectName,
                status_label: '已完成',
                mode: 'completed_project_to_template',
                title: '从已完成项目生成模板',
                subtitle: '把已完成项目沉淀成可复用模板。',
                quickActions: [
                  {
                    path: 'completed_project_to_template',
                    label: '已完成项目 -> WBS 模板',
                    description: '把已跑通的项目结构整理成模板资产。',
                  },
                ],
                checklist: [
                  { key: 'scan', title: '先看现状', detail: '识别当前执行到哪一步。' },
                  { key: 'bootstrap', title: '自动生成', detail: '把项目沉淀成模板。' },
                ],
                learnMore: {
                  title: '了解更多',
                  sections: [
                    { heading: '项目基线', body: '把成熟结构整理成模板。' },
                    { heading: '反馈回写', body: '把已完成项目的经验反馈回模板。' },
                  ],
                },
              },
            },
          }),
        } as never
      }

      if (url.includes('/api/planning/wbs-templates?')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [
              {
                id: templateId,
                name: '完成项目模板',
                description: '从完成项目沉淀出的模板',
                template_type: '交付模板',
                node_count: 5,
                reference_days: 12,
                template_data: {
                  wbs_nodes: [
                    {
                      title: '前期准备',
                      reference_days: null,
                      children: [
                        { title: '现场踏勘', reference_days: 2, children: [] },
                      ],
                    },
                    {
                      title: '主体结构',
                      reference_days: null,
                      children: [
                        { title: '钢筋安装', reference_days: 3, children: [] },
                        { title: '模板安装', reference_days: null, children: [] },
                        { title: '模板安装', reference_days: 4, children: [] },
                      ],
                    },
                    {
                      title: '收尾验收',
                      reference_days: null,
                      children: [],
                    },
                  ],
                },
              },
            ],
          }),
        } as never
      }

      if (url.includes(`/api/wbs-template-governance/${templateId}/reference-days/confirm`)) {
        expect(init?.method).toBe('POST')
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              template_id: templateId,
              reference_days: 16,
              template_data: {
                wbs_nodes: [
                  {
                    title: '前期准备',
                    reference_days: 3,
                    children: [
                      { title: '现场踏勘', reference_days: 3, children: [] },
                    ],
                  },
                ],
              },
            },
          }),
        } as never
      }

      if (url.includes(`/api/wbs-template-governance/${generatedTemplateId}/reference-days/confirm`)) {
        expect(init?.method).toBe('POST')
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              template_id: generatedTemplateId,
              reference_days: 18,
              template_data: {
                wbs_nodes: [
                  {
                    title: '前期准备',
                    reference_days: 4,
                    children: [
                      { title: '现场踏勘', reference_days: 4, children: [] },
                    ],
                  },
                ],
              },
            },
          }),
        } as never
      }

      if (url.includes(`/api/wbs-template-governance/${generatedTemplateId}/reference-days`)) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              template_id: generatedTemplateId,
              template_name: generatedTemplateName,
              updated_count: 1,
              feedback: {
                completed_project_count: 1,
                sample_task_count: 4,
                node_count: 2,
                nodes: [
                  {
                    path: '前期准备/现场踏勘',
                    title: '现场踏勘',
                    sample_count: 2,
                    mean_days: 4,
                    median_days: 4,
                    current_reference_days: null,
                    suggested_reference_days: 4,
                  },
                ],
              },
              nodes: [
                {
                  path: '前期准备/现场踏勘',
                  title: '现场踏勘',
                  sample_count: 2,
                  mean_days: 4,
                  median_days: 4,
                  current_reference_days: null,
                  suggested_reference_days: 4,
                },
              ],
            },
          }),
        } as never
      }

      if (url.includes(`/api/wbs-template-governance/${templateId}/reference-days`)) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              template_id: templateId,
              template_name: '完成项目模板',
              updated_count: 2,
              feedback: {
                completed_project_count: 4,
                sample_task_count: 18,
                node_count: 5,
                nodes: [
                  {
                    path: '主体结构/模板安装',
                    title: '模板安装',
                    sample_count: 6,
                    mean_days: 4.3,
                    median_days: 4,
                    current_reference_days: null,
                    suggested_reference_days: 4,
                  },
                  {
                    path: '收尾验收',
                    title: '收尾验收',
                    sample_count: 4,
                    mean_days: 2.1,
                    median_days: 2,
                    current_reference_days: null,
                    suggested_reference_days: 2,
                  },
                ],
              },
              nodes: [
                {
                  path: '主体结构/模板安装',
                  title: '模板安装',
                  sample_count: 6,
                  mean_days: 4.3,
                  median_days: 4,
                  current_reference_days: null,
                  suggested_reference_days: 4,
                },
                {
                  path: '收尾验收',
                  title: '收尾验收',
                  sample_count: 4,
                  mean_days: 2.1,
                  median_days: 2,
                  current_reference_days: null,
                  suggested_reference_days: 2,
                },
              ],
            },
          }),
        } as never
      }

      if (url.includes('/api/planning/wbs-templates/bootstrap/from-completed-project')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              path: 'completed_project_to_template',
              template: {
                id: generatedTemplateId,
                template_name: generatedTemplateName,
                description: '由已完成项目沉淀出来的模板，可直接复用到新项目。',
                template_type: '交付模板',
                node_count: 2,
                reference_days: 18,
                template_data: {
                  wbs_nodes: [
                    {
                      title: '前期准备',
                      reference_days: 4,
                      children: [
                        { title: '现场踏勘', reference_days: 4, children: [] },
                      ],
                    },
                  ],
                },
                wbs_nodes: {
                  wbs_nodes: [
                    {
                      title: '前期准备',
                      reference_days: 4,
                      children: [
                        { title: '现场踏勘', reference_days: 4, children: [] },
                      ],
                    },
                  ],
                },
              },
              created_item_count: 1,
            },
          }),
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

  it('supports applying only selected governance suggestions', async () => {
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
    await waitForCondition(() => Boolean(container.querySelector('[data-testid="wbs-template-apply-feedback"]')))
    await waitForCondition(() => (container.textContent ?? '').includes('已选 2 / 2'))

    const secondCheckbox = container.querySelector('[data-testid="wbs-template-suggestion-checkbox-1"]') as HTMLInputElement | null
    expect(secondCheckbox).toBeTruthy()

    await act(async () => {
      secondCheckbox?.click()
      await flush()
    })

    await waitForCondition(() => (container.textContent ?? '').includes('已选 1 / 2'))

    const applyButton = container.querySelector('[data-testid="wbs-template-apply-feedback"]') as HTMLButtonElement | null
    expect(applyButton).toBeTruthy()

    await act(async () => {
      applyButton?.click()
      await flush()
    })

    await waitForCondition(() =>
      fetchMock.mock.calls.some(([url, options]) =>
        String(url).includes(`/api/wbs-template-governance/${templateId}/reference-days/confirm`) &&
        String(options?.method ?? 'GET').toUpperCase() === 'POST',
      ),
    )

    const confirmCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes(`/api/wbs-template-governance/${templateId}/reference-days/confirm`),
    )
    expect(confirmCall).toBeTruthy()
    const payload = JSON.parse(String(confirmCall?.[1]?.body ?? '{}'))
    expect(payload).toEqual({
      apply_all: false,
      selected_paths: ['主体结构/模板安装'],
    })
  })

  it('shows the quality panel, feedback summary, and governance actions for completed-project templates', async () => {
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
    await waitForCondition(() => Boolean(container.querySelector('[data-testid="wbs-template-feedback-summary"]')))

    expect(container.querySelector('[data-testid="wbs-template-quality-panel"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="wbs-template-quality-missing-reference-days"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="wbs-template-quality-missing-standard-steps"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="wbs-template-quality-structure-anomalies"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="wbs-template-feedback-summary"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="wbs-template-generate-from-completed"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="wbs-template-apply-feedback"]')).toBeTruthy()

    const generateButton = container.querySelector('[data-testid="wbs-template-generate-from-completed"]') as HTMLButtonElement | null
    expect(generateButton).toBeTruthy()

    await act(async () => {
      generateButton?.click()
      await flush()
    })

    await waitForCondition(() =>
      fetchMock.mock.calls.some(([url, options]) =>
        String(url).includes('/api/planning/wbs-templates/bootstrap/from-completed-project') &&
        String(options?.method ?? 'GET').toUpperCase() === 'POST',
      ),
    )

    await waitForCondition(() => (container.textContent ?? '').includes(generatedTemplateName))
    expect(container.textContent).toContain(generatedTemplateName)

    const applyButton = container.querySelector('[data-testid="wbs-template-apply-feedback"]') as HTMLButtonElement | null
    expect(applyButton).toBeTruthy()
    await waitForCondition(() => Boolean(applyButton && !applyButton.disabled))

    await act(async () => {
      applyButton?.click()
      await flush()
    })

    await waitForCondition(() =>
      fetchMock.mock.calls.some(([url, options]) =>
        String(url).includes(`/api/wbs-template-governance/${generatedTemplateId}/reference-days/confirm`) &&
        String(options?.method ?? 'GET').toUpperCase() === 'POST',
      ),
    )

    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes(`/api/wbs-template-governance/${generatedTemplateId}/reference-days/confirm`)),
    ).toBe(true)
    const generatedConfirmCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes(`/api/wbs-template-governance/${generatedTemplateId}/reference-days/confirm`),
    )
    expect(generatedConfirmCall).toBeTruthy()
    const generatedPayload = JSON.parse(String(generatedConfirmCall?.[1]?.body ?? '{}'))
    expect(generatedPayload).toEqual({
      apply_all: true,
      selected_paths: ['前期准备/现场踏勘'],
    })
  })
})
