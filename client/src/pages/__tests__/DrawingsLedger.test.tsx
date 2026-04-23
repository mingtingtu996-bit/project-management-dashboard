import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DrawingLedger } from '../Drawings/components/DrawingLedger'
import type { DrawingLedgerRow } from '../Drawings/types'

describe('Drawings ledger contract', () => {
  const row: DrawingLedgerRow = {
    drawingId: 'drawing-1',
    packageId: 'pkg-structure',
    packageCode: 'pkg-structure',
    packageName: '结构施工图包',
    disciplineType: '结构',
    documentPurpose: '施工执行',
    drawingCode: 'STR-001',
    drawingName: '基础图',
    versionNo: '1.2',
    drawingStatus: 'issued',
    reviewStatus: '已通过',
    isCurrentVersion: true,
    requiresReview: false,
    reviewMode: 'none',
    reviewModeLabel: '不适用',
    reviewBasis: '常规施工执行包默认不送审',
    hasChange: false,
    scheduleImpactFlag: false,
    plannedSubmitDate: null,
    actualSubmitDate: null,
    plannedPassDate: null,
    actualPassDate: null,
    designUnit: null,
    reviewUnit: null,
    createdAt: '2026-04-15T00:00:00.000Z',
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

  it('renders table rows and version actions', () => {
    const onSelectRow = vi.fn()
    const onOpenVersions = vi.fn()

    render(<DrawingLedger drawings={[row]} onSelectRow={onSelectRow} onOpenVersions={onOpenVersions} />)

    expect(container.textContent).toContain('图纸台账')
    expect(container.textContent).toContain('结构施工图包')
    expect(container.textContent).toContain('基础图')
    expect(container.textContent).toContain('当前版')
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0)
  })
})

