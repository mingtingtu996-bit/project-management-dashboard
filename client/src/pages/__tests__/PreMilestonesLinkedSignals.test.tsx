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

describe('PreMilestones linked signals', () => {
  const projectId = 'project-1'
  let container: HTMLDivElement
  let root: Root | null = null

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
        current_stage: '审批领证',
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
        next_action: '补齐签章资料',
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
        notes: '先补扫描件',
        latest_record_at: '2026-05-09',
        certificate_ids: ['cert-land', 'cert-land-use'],
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
    linkedWarnings: [
      {
        id: 'warning-link',
        project_id: projectId,
        task_id: 'cert-land-use',
        warning_type: 'permit_expiry',
        warning_level: 'critical',
        title: '证照预警',
        description: '当前证照存在到期提醒',
        is_acknowledged: false,
        created_at: '2026-05-10T00:00:00.000Z',
      },
    ],
    linkedIssues: [
      {
        id: 'issue-link',
        project_id: projectId,
        task_id: null,
        title: '关联问题',
        description: '由联动预警升级而来',
        severity: 'high',
        status: 'open',
        source_type: 'manual',
        source_id: 'warning-link',
        chain_id: 'warning-link',
        pending_manual_close: false,
        version: 1,
        created_at: '2026-05-10T00:00:00.000Z',
        updated_at: '2026-05-10T00:00:00.000Z',
      },
    ],
    linkedRisks: [
      {
        id: 'risk-link',
        project_id: projectId,
        task_id: null,
        title: '关联风险',
        description: '由联动问题继续升级',
        level: 'high',
        status: 'identified',
        source_type: 'manual',
        source_id: 'issue-link',
        chain_id: 'issue-link',
        linked_issue_id: 'issue-link',
        pending_manual_close: false,
        closed_reason: null,
        closed_at: null,
        version: 1,
        created_at: '2026-05-10T00:00:00.000Z',
        updated_at: '2026-05-10T00:00:00.000Z',
      },
    ],
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    let detailData = JSON.parse(JSON.stringify(detailPayload))

    useStore.setState({
      currentProject: {
        id: projectId,
        name: '专项示例项目',
      } as never,
      projects: [] as never,
      tasks: [] as never,
      risks: [] as never,
      milestones: [] as never,
      conditions: [] as never,
      obstacles: [] as never,
    })

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
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
          json: async () => ({ success: true, data: detailData }),
        } as never
      }

      if (url.includes('/pre-milestones/') && url.includes('/escalate-issue')) {
        detailData = {
          ...detailData,
          linkedIssues: [
            ...detailData.linkedIssues,
            {
              id: 'issue-created',
              project_id: projectId,
              task_id: null,
              title: '新增证照问题',
              description: '由证照详情抽屉一键升级',
              severity: 'high',
              status: 'open',
              source_type: 'manual',
              source_id: null,
              chain_id: 'issue-created',
              pending_manual_close: false,
              version: 1,
              created_at: '2026-05-10T01:00:00.000Z',
              updated_at: '2026-05-10T01:00:00.000Z',
            },
          ],
        }
        return {
          ok: true,
          json: async () => ({ success: true, data: detailData.linkedIssues[detailData.linkedIssues.length - 1] }),
        } as never
      }

      if (url.includes('/pre-milestones/') && url.includes('/escalate-risk')) {
        detailData = {
          ...detailData,
          linkedRisks: [
            ...detailData.linkedRisks,
            {
              id: 'risk-created',
              project_id: projectId,
              task_id: null,
              title: '新增证照风险',
              description: '由证照详情抽屉一键升级',
              level: 'high',
              status: 'identified',
              source_type: 'manual',
              source_id: null,
              chain_id: 'risk-created',
              linked_issue_id: null,
              pending_manual_close: false,
              closed_reason: null,
              closed_at: null,
              version: 1,
              created_at: '2026-05-10T01:05:00.000Z',
              updated_at: '2026-05-10T01:05:00.000Z',
            },
          ],
        }
        return {
          ok: true,
          json: async () => ({ success: true, data: detailData.linkedRisks[detailData.linkedRisks.length - 1] }),
        } as never
      }

      throw new Error(`Unexpected fetch url: ${url}`)
    }))
  })

  afterEach(() => {
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

  it('renders linked warnings, issues, and risks in the certificate detail drawer', async () => {
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/pre-milestones`]}>
          <Routes>
            <Route path="/projects/:id/pre-milestones" element={<PreMilestones />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForText(container, ['证照与验收', '前期证照'])

    const trigger = Array.from(container.querySelectorAll('[role="button"]')).find((button) =>
      button.textContent?.includes('用地规划许可证'),
    ) as HTMLElement | undefined

    expect(trigger).toBeTruthy()

    await act(async () => {
      trigger?.click()
      await flush()
    })

    await waitForText(document.body, ['详情抽屉', '联动预警', '联动问题', '联动风险', '前往风险与问题'])

    const drawer = document.body.querySelector('[role="dialog"]') ?? document.body
    const drawerText = drawer.textContent || ''

    expect(drawerText).toContain('证照预警')
    expect(drawerText).toContain('关联问题')
    expect(drawerText).toContain('关联风险')
    expect(drawerText).toContain('强依赖')
    expect(drawerText).toContain('软依赖')
    expect(drawer.querySelector('[data-testid="linked-warnings"]')).toBeTruthy()
    expect(drawer.querySelector('[data-testid="linked-issues"]')).toBeTruthy()
    expect(drawer.querySelector('[data-testid="linked-risks"]')).toBeTruthy()
  })

  it('escalates the current certificate into issue and risk main chains from the detail drawer', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/pre-milestones`]}>
          <Routes>
            <Route path="/projects/:id/pre-milestones" element={<PreMilestones />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForText(container, ['证照与验收', '前期证照'])

    const trigger = Array.from(container.querySelectorAll('[role="button"]')).find((button) =>
      button.textContent?.includes('用地规划许可证'),
    ) as HTMLElement | undefined

    await act(async () => {
      trigger?.click()
      await flush()
    })

    await waitForText(document.body, ['升级处置', '升级为问题', '升级为风险'])

    const issueButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('升级为问题'),
    ) as HTMLButtonElement | undefined
    const riskButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('升级为风险'),
    ) as HTMLButtonElement | undefined

    expect(issueButton).toBeTruthy()
    expect(riskButton).toBeTruthy()

    await act(async () => {
      issueButton?.click()
      await flush()
    })
    await waitForText(document.body, ['新增证照问题'])

    await act(async () => {
      riskButton?.click()
      await flush()
    })
    await waitForText(document.body, ['新增证照风险'])

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects/project-1/pre-milestones/cert-land-use/escalate-issue'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects/project-1/pre-milestones/cert-land-use/escalate-risk'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects/project-1/pre-milestones/board'),
      expect.objectContaining({ cache: 'no-store' }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects/project-1/pre-milestones/ledger'),
      expect.objectContaining({ cache: 'no-store' }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects/project-1/pre-milestones/cert-land-use/detail'),
      expect.objectContaining({ cache: 'no-store' }),
    )
  })

  it('does not carry drawing legacy runtime in the standalone certificate page', async () => {
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/pre-milestones`]}>
          <Routes>
            <Route path="/projects/:id/pre-milestones" element={<PreMilestones />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForText(container, ['证照与验收', '前期证照'])

    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(0)
    expect(container.querySelector('[data-testid="pre-milestones-go-drawings"]')).toBeTruthy()
    expect(container.textContent).not.toContain('图纸类型')
    expect(container.textContent).not.toContain('新建施工图纸')
  })
})
