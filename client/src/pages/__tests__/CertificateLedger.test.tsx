import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CertificateLedger } from '../PreMilestones/components/CertificateLedger'
import type { CertificateBoardItem, CertificateSharedRibbonItem, CertificateWorkItem } from '../PreMilestones/types'

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function LocationProbe({ onChange }: { onChange: (value: string) => void }) {
  const location = useLocation()

  useEffect(() => {
    onChange(`${location.pathname}${location.search}`)
  }, [location, onChange])

  return null
}

describe('CertificateLedger linked escalation actions', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  const certificate: CertificateBoardItem = {
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
    work_item_ids: ['work-linked'],
    shared_work_item_ids: [],
  }

  const linkedItem: CertificateWorkItem = {
    id: 'work-linked',
    project_id: 'project-1',
    item_code: 'W-001',
    item_name: '规划资料补正',
    item_stage: '外部报批',
    status: 'supplement_required',
    planned_finish_date: '2026-05-20',
    actual_finish_date: null,
    approving_authority: '规划局',
    is_shared: false,
    next_action: '补齐签章资料',
    next_action_due_date: '2026-05-18',
    is_blocked: true,
    block_reason: '资料待补正',
    sort_order: 1,
    notes: null,
    latest_record_at: '2026-05-09',
    certificate_ids: ['cert-land-use'],
    linked_issue_id: 'issue-123',
    linked_risk_id: 'risk-456',
    created_at: '2026-05-08T00:00:00.000Z',
    updated_at: '2026-05-09T00:00:00.000Z',
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })

    root = null
    container.remove()
  })

  it('shows linked targets and prevents duplicate issue or risk escalation', async () => {
    const onEscalateIssue = vi.fn()
    const onEscalateRisk = vi.fn()
    let currentLocation = ''
    const emptySharedItems: CertificateSharedRibbonItem[] = []

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={['/projects/project-1/pre-milestones']}>
          <LocationProbe onChange={(value) => { currentLocation = value }} />
          <CertificateLedger
            items={[linkedItem]}
            certificates={[certificate]}
            sharedItems={emptySharedItems}
            onSelectWorkItem={vi.fn()}
            onOpenDetail={vi.fn()}
            onAddItem={vi.fn()}
            onEditItem={vi.fn()}
            onEscalateIssue={onEscalateIssue}
            onEscalateRisk={onEscalateRisk}
          />
        </MemoryRouter>,
      )
    })

    await act(async () => {
      await flush()
    })

    expect(container.textContent).toContain('已关联问题')
    expect(container.textContent).toContain('已关联风险')
    expect(container.textContent).toContain('查看关联问题')
    expect(container.textContent).toContain('查看关联风险')
    expect(container.textContent).not.toContain('升级为问题')
    expect(container.textContent).not.toContain('升级为风险')

    const issueButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('查看关联问题'),
    ) as HTMLButtonElement | undefined
    const riskButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('查看关联风险'),
    ) as HTMLButtonElement | undefined

    await act(async () => {
      issueButton?.click()
      await flush()
    })
    expect(currentLocation).toBe('/projects/project-1/risks?stream=issues&issueId=issue-123')

    await act(async () => {
      riskButton?.click()
      await flush()
    })
    expect(currentLocation).toBe('/projects/project-1/risks?stream=risks&riskId=risk-456')
    expect(onEscalateIssue).not.toHaveBeenCalled()
    expect(onEscalateRisk).not.toHaveBeenCalled()
  })
})
