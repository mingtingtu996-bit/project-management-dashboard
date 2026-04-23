import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DrawingPackageBoard } from '../Drawings/components/DrawingPackageBoard'
import { DrawingReadinessSummary } from '../Drawings/components/DrawingReadinessSummary'
import type { DrawingBoardSummary, DrawingPackageCard } from '../Drawings/types'

describe('Drawings board contracts', () => {
  const summary: DrawingBoardSummary = {
    totalPackages: 3,
    missingPackages: 1,
    mandatoryReviewPackages: 2,
    reviewingPackages: 1,
    scheduleImpactCount: 1,
    readyForConstructionCount: 2,
    readyForAcceptanceCount: 1,
  }

  const packageCard: DrawingPackageCard = {
    packageId: 'pkg-structure',
    packageCode: 'pkg-structure',
    packageName: '结构施工图包',
    disciplineType: '结构',
    documentPurpose: '施工执行',
    status: 'preparing',
    requiresReview: false,
    reviewMode: 'none',
    reviewModeLabel: '不适用',
    reviewBasis: '常规施工执行包默认不送审',
    completenessRatio: 75,
    missingRequiredCount: 1,
    currentVersionDrawingId: 'drawing-1',
    currentVersionNo: '1.2',
    currentVersionLabel: '当前有效版 v1.2',
    currentReviewStatus: '已通过',
    hasChange: false,
    scheduleImpactFlag: true,
    isReadyForConstruction: true,
    isReadyForAcceptance: false,
    drawingsCount: 3,
    requiredItemsCount: 4,
    latestUpdateAt: '2026-04-15T00:00:00.000Z',
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

  it('renders the readiness summary', () => {
    render(<DrawingReadinessSummary summary={summary} projectName="示例项目" />)

    expect(container.textContent).toContain('图纸准备度总览')
    expect(container.textContent).toContain('图纸包总数')
    expect(container.textContent).toContain('示例项目')
  })

  it('renders grouped package cards and actions', () => {
    const onSelectPackage = vi.fn()
    const onOpenVersions = vi.fn()

    render(
      <DrawingPackageBoard
        groups={[{ disciplineType: '结构', packages: [packageCard] }]}
        onSelectPackage={onSelectPackage}
        onOpenVersions={onOpenVersions}
      />,
    )

    expect(container.textContent).toContain('图纸包主视图')
    expect(container.textContent).toContain('结构施工图包')
    expect(container.textContent).toContain('结构')
    expect(container.textContent).toContain('75%')
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0)
  })
})

