import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const navigateMock = vi.fn()
const toastMock = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({ id: 'project-1' }),
  Link: ({ children }: { children?: unknown }) => children,
}))

vi.mock('@/hooks/useStore', () => ({
  useCurrentProject: () => ({ id: 'project-1', name: '示例项目', role: 'owner' }),
  useStore: () => ({
    currentProject: { id: 'project-1', name: '示例项目' },
    projects: [{ id: 'project-1', name: '示例项目' }],
  }),
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}))

import Drawings from '../Drawings'

describe('Drawings view modes', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  const boardResponse = {
    success: true,
    data: {
      summary: {
        totalPackages: 2,
        missingPackages: 1,
        mandatoryReviewPackages: 1,
        reviewingPackages: 1,
        scheduleImpactCount: 0,
        readyForConstructionCount: 1,
        readyForAcceptanceCount: 0,
      },
      packages: [
        {
          packageId: 'pkg-missing',
          packageCode: 'pkg-missing',
          packageName: '缺漏包',
          disciplineType: '建筑',
          documentPurpose: '施工执行',
          status: 'preparing',
          requiresReview: false,
          reviewMode: 'none',
          reviewModeLabel: '不适用',
          reviewBasis: '模板默认',
          completenessRatio: 50,
          missingRequiredCount: 1,
          currentVersionDrawingId: 'drawing-missing',
          currentVersionNo: '1.0',
          currentVersionLabel: '当前有效版 v1.0',
          currentReviewStatus: '不适用',
          hasChange: false,
          scheduleImpactFlag: false,
          isReadyForConstruction: false,
          isReadyForAcceptance: false,
          drawingsCount: 1,
          requiredItemsCount: 2,
          latestUpdateAt: '2026-04-15T00:00:00.000Z',
        },
        {
          packageId: 'pkg-review',
          packageCode: 'pkg-review',
          packageName: '送审包',
          disciplineType: '消防',
          documentPurpose: '送审报批',
          status: 'reviewing',
          requiresReview: true,
          reviewMode: 'mandatory',
          reviewModeLabel: '必须送审',
          reviewBasis: '消防专项包默认必须送审',
          completenessRatio: 100,
          missingRequiredCount: 0,
          currentVersionDrawingId: 'drawing-review',
          currentVersionNo: '2.0',
          currentVersionLabel: '当前有效版 v2.0',
          currentReviewStatus: '待送审',
          hasChange: false,
          scheduleImpactFlag: false,
          isReadyForConstruction: true,
          isReadyForAcceptance: false,
          drawingsCount: 1,
          requiredItemsCount: 1,
          latestUpdateAt: '2026-04-15T00:00:00.000Z',
        },
      ],
    },
    timestamp: new Date().toISOString(),
  }

  const ledgerResponse = {
    success: true,
    data: {
      drawings: [
        {
          drawingId: 'drawing-missing',
          packageId: 'pkg-missing',
          packageCode: 'pkg-missing',
          packageName: '缺漏包',
          disciplineType: '建筑',
          documentPurpose: '施工执行',
          drawingCode: 'M-001',
          drawingName: '缺漏图',
          versionNo: '1.0',
          drawingStatus: 'issued',
          reviewStatus: '不适用',
          isCurrentVersion: true,
          requiresReview: false,
          reviewMode: 'none',
          reviewModeLabel: '不适用',
          reviewBasis: '模板默认',
          hasChange: false,
          scheduleImpactFlag: false,
          plannedSubmitDate: null,
          actualSubmitDate: null,
          plannedPassDate: null,
          actualPassDate: null,
          createdAt: '2026-04-15T00:00:00.000Z',
        },
        {
          drawingId: 'drawing-review',
          packageId: 'pkg-review',
          packageCode: 'pkg-review',
          packageName: '送审包',
          disciplineType: '消防',
          documentPurpose: '送审报批',
          drawingCode: 'R-001',
          drawingName: '送审图',
          versionNo: '2.0',
          drawingStatus: 'reviewing',
          reviewStatus: '待送审',
          isCurrentVersion: true,
          requiresReview: true,
          reviewMode: 'mandatory',
          reviewModeLabel: '必须送审',
          reviewBasis: '消防专项包默认必须送审',
          hasChange: false,
          scheduleImpactFlag: false,
          plannedSubmitDate: null,
          actualSubmitDate: null,
          plannedPassDate: null,
          actualPassDate: null,
          createdAt: '2026-04-15T01:00:00.000Z',
        },
      ],
    },
    timestamp: new Date().toISOString(),
  }

  function render(node: ReactElement) {
    act(() => {
      root?.render(node)
    })
  }

  function getBoardSectionText(title: string) {
    const section = Array.from(container.querySelectorAll('section')).find((node) => {
      const heading = node.querySelector('h2')
      return heading?.textContent?.includes(title)
    })
    return section?.textContent ?? ''
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const payload = url.includes('/ledger') ? ledgerResponse : boardResponse
      return {
        ok: true,
        json: async () => payload,
      } as Response
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('switches between missing and review focused views with consistent data', async () => {
    await act(async () => {
      render(<Drawings />)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/construction-drawings/board?projectId=project-1'),
      expect.objectContaining({ cache: 'no-store' }),
    )
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/construction-drawings/ledger?projectId=project-1'),
      expect.objectContaining({ cache: 'no-store' }),
    )

    expect(container.textContent).toContain('概览')
    expect(container.textContent).toContain('缺漏包')
    expect(container.textContent).toContain('送审包')

    const buttons = Array.from(container.querySelectorAll('button'))
    const missingButton = buttons.find((button) => button.textContent?.includes('缺漏视图'))
    const reviewButton = buttons.find((button) => button.textContent?.includes('送审视图'))
    expect(missingButton).toBeTruthy()
    expect(reviewButton).toBeTruthy()

    await act(async () => {
      missingButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.textContent).toContain('缺漏视图')
    const missingBoardText = getBoardSectionText('缺漏视图')
    expect(missingBoardText).toContain('缺漏包')
    expect(missingBoardText).not.toContain('送审包')
    expect(missingBoardText).not.toContain('送审图')

    await act(async () => {
      reviewButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(container.textContent).toContain('送审视图')
    const reviewBoardText = getBoardSectionText('送审视图')
    expect(reviewBoardText).toContain('送审包')
    expect(reviewBoardText).not.toContain('缺漏包')
    expect(reviewBoardText).not.toContain('缺漏图')
  })
})
