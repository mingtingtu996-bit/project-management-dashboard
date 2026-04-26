import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PreMilestones from '../PreMilestones'
import { useStore } from '@/hooks/useStore'

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

describe('License management presentation layer', () => {
  const projectId = 'project-1'
  const projectName = '示例项目'
  let container: HTMLDivElement
  let root: Root | null = null
  const fetchMock = vi.fn()

  const boardPayload = {
    summary: {
      completedCount: 1,
      totalCount: 4,
      blockingCertificateType: 'land_use_planning_permit',
      expectedReadyDate: '2026-05-20',
      overdueCount: 1,
      supplementCount: 1,
      weeklyActionCount: 2,
    },
    certificates: [
      {
        id: 'cert-land',
        certificate_type: 'land_certificate',
        certificate_name: '土地证',
        status: 'issued',
        current_stage: '批复领证',
        planned_finish_date: '2026-05-08',
        actual_finish_date: '2026-05-07',
        approving_authority: '自然资源局',
        next_action: '归档',
        next_action_due_date: '2026-05-08',
        is_blocked: false,
        block_reason: null,
        latest_record_at: '2026-05-07',
        work_item_ids: ['work-1'],
        shared_work_item_ids: ['work-1'],
      },
      {
        id: 'cert-land-use',
        certificate_type: 'land_use_planning_permit',
        certificate_name: '用地规划许可证',
        status: 'supplement_required',
        current_stage: '外部报批',
        planned_finish_date: '2026-05-20',
        actual_finish_date: null,
        approving_authority: '规划局',
        next_action: '补齐盖章资料',
        next_action_due_date: '2026-05-18',
        is_blocked: true,
        block_reason: '资料待补正',
        latest_record_at: '2026-05-09',
        work_item_ids: ['work-1'],
        shared_work_item_ids: ['work-1'],
      },
      {
        id: 'cert-engineering',
        certificate_type: 'engineering_planning_permit',
        certificate_name: '工程规划许可证',
        status: 'internal_review',
        current_stage: '内部报审',
        planned_finish_date: '2026-05-24',
        actual_finish_date: null,
        approving_authority: '规划局',
        next_action: '等待内部会签',
        next_action_due_date: '2026-05-21',
        is_blocked: false,
        block_reason: null,
        latest_record_at: '2026-05-09',
        work_item_ids: ['work-2'],
        shared_work_item_ids: [],
      },
      {
        id: 'cert-construction',
        certificate_type: 'construction_permit',
        certificate_name: '施工许可证',
        status: 'pending',
        current_stage: '资料准备',
        planned_finish_date: '2026-05-30',
        actual_finish_date: null,
        approving_authority: '住建局',
        next_action: '整理开工资料',
        next_action_due_date: '2026-05-26',
        is_blocked: false,
        block_reason: null,
        latest_record_at: '2026-05-09',
        work_item_ids: [],
        shared_work_item_ids: [],
      },
    ],
    sharedItems: [
      {
        work_item_id: 'work-1',
        item_name: '共享资料收集',
        item_stage: '资料准备',
        status: 'internal_review',
        is_shared: true,
        certificate_types: ['land_certificate', 'land_use_planning_permit'],
        certificate_names: ['土地证', '用地规划许可证'],
        blocking_certificate_types: ['land_use_planning_permit'],
        dependency_count: 2,
        next_action: '补齐原件扫描件',
        next_action_due_date: '2026-05-15',
        block_reason: '两证共用资料待补正',
        planned_finish_date: '2026-05-12',
      },
    ],
  }

  const ledgerPayload = {
    items: [
      {
        id: 'work-1',
        project_id: projectId,
        item_code: 'W-001',
        item_name: '共享资料收集',
        item_stage: '资料准备',
        status: 'internal_review',
        planned_finish_date: '2026-05-12',
        actual_finish_date: null,
        approving_authority: '审批局',
        is_shared: true,
        next_action: '补齐原件扫描件',
        next_action_due_date: '2026-05-15',
        is_blocked: true,
        block_reason: '两证共用资料待补正',
        sort_order: 1,
        notes: '先补齐扫描件',
        latest_record_at: '2026-05-09',
        certificate_ids: ['cert-land', 'cert-land-use'],
        created_at: '2026-05-08T00:00:00.000Z',
        updated_at: '2026-05-09T00:00:00.000Z',
      },
      {
        id: 'work-2',
        project_id: projectId,
        item_code: 'W-002',
        item_name: '规划会签',
        item_stage: '内部报审',
        status: 'preparing_documents',
        planned_finish_date: '2026-05-24',
        actual_finish_date: null,
        approving_authority: '规划局',
        is_shared: false,
        next_action: '提交会签材料',
        next_action_due_date: '2026-05-21',
        is_blocked: false,
        block_reason: null,
        sort_order: 2,
        notes: null,
        latest_record_at: '2026-05-09',
        certificate_ids: ['cert-engineering'],
        created_at: '2026-05-08T00:00:00.000Z',
        updated_at: '2026-05-09T00:00:00.000Z',
      },
    ],
    totals: {
      overdueCount: 1,
      blockedCount: 1,
      supplementCount: 1,
    },
  }

  const detailPayload = {
    certificate: boardPayload.certificates[1],
    workItems: [ledgerPayload.items[0]],
    dependencies: [
      {
        id: 'dep-1',
        project_id: projectId,
        predecessor_type: 'certificate',
        predecessor_id: 'cert-land',
        successor_type: 'work_item',
        successor_id: 'work-1',
        dependency_kind: 'hard',
        notes: null,
        created_at: '2026-05-08T00:00:00.000Z',
      },
      {
        id: 'dep-2',
        project_id: projectId,
        predecessor_type: 'certificate',
        predecessor_id: 'cert-land-use',
        successor_type: 'work_item',
        successor_id: 'work-1',
        dependency_kind: 'hard',
        notes: null,
        created_at: '2026-05-08T00:00:00.000Z',
      },
    ],
    records: [
      {
        id: 'record-1',
        project_id: projectId,
        target_type: 'certificate',
        target_id: 'cert-land-use',
        record_type: 'supplement_required',
        from_status: 'internal_review',
        to_status: 'supplement_required',
        content: '补正资料退回',
        recorded_at: '2026-05-09T00:00:00.000Z',
        recorded_by: 'system',
      },
    ],
    dependencyMatrix: [
      {
        certificate_id: 'cert-land',
        certificate_type: 'land_certificate',
        certificate_name: '土地证',
        cells: [
          {
            work_item_id: 'work-1',
            work_item_name: '共享资料收集',
            status: 'satisfied',
            dependency_kind: 'hard',
            is_shared: true,
          },
        ],
      },
      {
        certificate_id: 'cert-land-use',
        certificate_type: 'land_use_planning_permit',
        certificate_name: '用地规划许可证',
        cells: [
          {
            work_item_id: 'work-1',
            work_item_name: '共享资料收集',
            status: 'blocked',
            dependency_kind: 'hard',
            is_shared: true,
          },
        ],
      },
      {
        certificate_id: 'cert-engineering',
        certificate_type: 'engineering_planning_permit',
        certificate_name: '工程规划许可证',
        cells: [
          {
            work_item_id: 'work-1',
            work_item_name: '共享资料收集',
            status: 'pending',
            dependency_kind: 'soft',
            is_shared: true,
          },
        ],
      },
      {
        certificate_id: 'cert-construction',
        certificate_type: 'construction_permit',
        certificate_name: '施工许可证',
        cells: [
          {
            work_item_id: 'work-1',
            work_item_name: '共享资料收集',
            status: 'none',
            dependency_kind: null,
            is_shared: true,
          },
        ],
      },
    ],
    linkedWarnings: [],
    linkedIssues: [],
    linkedRisks: [],
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    useStore.setState({
      currentProject: {
        id: projectId,
        name: projectName,
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

      if (url.includes('/pre-milestones/board')) {
        return {
          ok: true,
          json: async () => ({ success: true, data: boardPayload }),
        } as never
      }

      if (url.includes('/pre-milestones/ledger')) {
        return {
          ok: true,
          json: async () => ({ success: true, data: ledgerPayload }),
        } as never
      }

      if (url.includes('/pre-milestones/') && url.includes('/detail')) {
        return {
          ok: true,
          json: async () => ({ success: true, data: detailPayload }),
        } as never
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

  it('keeps PreMilestones inside the special management parent module without legacy drawings runtime', async () => {
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/pre-milestones`]}>
          <Routes>
            <Route path="/projects/:id/pre-milestones" element={<PreMilestones />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForText(container, ['专项管理', '前期证照'])
    await waitForText(container, ['开工准入总览', '四证推进看板', '办理台账', '详情抽屉'])

    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(0)
    expect(container.querySelector('[data-testid="pre-milestones-go-drawings"]')).toBeTruthy()
    expect(container.textContent).not.toContain('construction-drawings')
    expect(container.textContent).not.toContain('图纸类型')
    expect(container.textContent).not.toContain('新建施工图纸')
  })
})
