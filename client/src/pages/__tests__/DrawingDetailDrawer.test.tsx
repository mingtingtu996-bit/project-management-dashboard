import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DrawingDetailDrawer } from '../Drawings/components/DrawingDetailDrawer'
import type { DrawingPackageDetailView } from '../Drawings/types'

describe('DrawingDetailDrawer linkage', () => {
  const detail: DrawingPackageDetailView = {
    package: {
      packageId: 'pkg-1',
      packageCode: 'PKG-1',
      packageName: 'Linkage Package',
      disciplineType: '建筑',
      documentPurpose: '施工执行',
      status: 'reviewing',
      requiresReview: true,
      reviewMode: 'mandatory',
      reviewModeLabel: '必审',
      reviewBasis: 'template',
      completenessRatio: 75,
      missingRequiredCount: 1,
      currentVersionDrawingId: 'draw-1',
      currentVersionNo: '1.1',
      currentVersionLabel: '当前有效版本 v1.1',
      currentReviewStatus: '待送审',
      hasChange: true,
      scheduleImpactFlag: true,
      isReadyForConstruction: false,
      isReadyForAcceptance: false,
      drawingsCount: 2,
      requiredItemsCount: 2,
      latestUpdateAt: '2026-04-15T00:00:00.000Z',
    },
    requiredItems: [
      {
        itemId: 'item-1',
        itemCode: 'ITEM-1',
        itemName: 'Sheet A',
        disciplineType: '建筑',
        isRequired: true,
        status: 'available',
        currentDrawingId: 'draw-1',
        currentVersion: '1.1',
        notes: '',
        sortOrder: 1,
      },
    ],
    drawings: [
      {
        drawingId: 'draw-1',
        packageId: 'pkg-1',
        packageCode: 'PKG-1',
        packageName: 'Linkage Package',
        disciplineType: '建筑',
        documentPurpose: '施工执行',
        drawingCode: 'DRW-1',
        drawingName: 'Drawing A',
        versionNo: '1.1',
        drawingStatus: 'issued',
        reviewStatus: '待送审',
        isCurrentVersion: true,
        requiresReview: true,
        reviewMode: 'mandatory',
        reviewModeLabel: '必审',
        reviewBasis: 'template',
        hasChange: true,
        scheduleImpactFlag: true,
        plannedSubmitDate: '2026-04-01T00:00:00.000Z',
        actualSubmitDate: null,
        plannedPassDate: '2026-04-05T00:00:00.000Z',
        actualPassDate: null,
        designUnit: null,
        reviewUnit: null,
        createdAt: '2026-04-15T00:00:00.000Z',
      },
    ],
    records: [],
    linkedTasks: [
      {
        id: 'task-1',
        name: 'Task A',
        status: 'in_progress',
        drawingConditionCount: 2,
        openConditionCount: 1,
        conditions: [
          {
            id: 'cond-1',
            name: 'Drawing Required',
            status: '未满足',
            conditionType: '图纸',
            isSatisfied: false,
          },
        ],
      },
    ],
    linkedAcceptance: [
      {
        id: 'plan-1',
        name: 'Acceptance A',
        status: 'pending',
        requirementCount: 1,
        openRequirementCount: 1,
        latestRecordAt: '2026-04-10T00:00:00.000Z',
        requirements: [
          {
            id: 'req-1',
            requirementType: 'drawing',
            sourceEntityType: 'drawing',
            sourceEntityId: 'draw-1',
            description: 'Need drawing package',
            status: 'open',
          },
        ],
      },
    ],
    issueSignals: [
      {
        code: 'missing-required',
        title: 'Missing required sheets',
        description: 'One required sheet is missing.',
        severity: 'high',
        evidence: ['missing:1'],
        escalatedEntityType: null,
        escalatedEntityId: null,
        escalatedAt: null,
      },
    ],
    riskSignals: [
      {
        code: 'schedule-impact',
        title: 'Schedule impact',
        description: 'The package impacts schedule.',
        severity: 'critical',
        evidence: ['flag:true'],
        escalatedEntityType: 'risk',
        escalatedEntityId: 'risk-1',
        escalatedAt: '2026-04-15T08:00:00.000Z',
      },
    ],
  }

  let container: HTMLDivElement
  let root: Root | null = null

  function render(node: ReactElement) {
    act(() => {
      root?.render(node)
    })
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
    document.body.innerHTML = ''
  })

  it('shows linked tasks, linked acceptance, and signal upgrade actions', () => {
    const onCreateIssue = vi.fn()
    const onCreateRisk = vi.fn()

    render(
      <DrawingDetailDrawer
        open
        detail={detail}
        onOpenChange={() => undefined}
        onOpenVersions={() => undefined}
        onSetCurrentVersion={() => undefined}
        onCreateIssue={onCreateIssue}
        onCreateRisk={onCreateRisk}
      />,
    )

    expect(document.body.textContent).toContain('Task A')
    expect(document.body.textContent).toContain('Acceptance A')
    expect(document.body.textContent).toContain('Missing required sheets')
    expect(document.body.textContent).toContain('Schedule impact')

    const issueButton = document.body.querySelector('[data-testid="drawing-signal-upgrade-missing-required"]') as HTMLButtonElement | null
    const riskButton = document.body.querySelector('[data-testid="drawing-signal-upgrade-schedule-impact"]') as HTMLButtonElement | null

    expect(issueButton).toBeTruthy()
    expect(riskButton).toBeTruthy()
    expect(riskButton?.disabled).toBe(true)

    act(() => {
      issueButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onCreateIssue).toHaveBeenCalledWith(detail.issueSignals[0])
    expect(onCreateRisk).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('已升级')
  })
})
