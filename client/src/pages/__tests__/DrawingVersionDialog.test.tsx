import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DrawingVersionDialog } from '../Drawings/components/DrawingVersionDialog'
import type { DrawingPackageCard, DrawingVersionView } from '../Drawings/types'

describe('DrawingVersionDialog contract', () => {
  const packageCard: DrawingPackageCard = {
    packageId: 'pkg-structure',
    packageCode: 'PKG-001',
    packageName: '结构施工图包',
    disciplineType: '结构',
    documentPurpose: '施工执行',
    status: 'active',
    requiresReview: true,
    reviewMode: 'mandatory',
    reviewModeLabel: '必须审图',
    reviewBasis: '必须保留当前有效版',
    completenessRatio: 100,
    missingRequiredCount: 0,
    currentVersionDrawingId: 'drawing-current',
    currentVersionNo: '3.0',
    currentVersionLabel: '当前有效版 v3.0',
    currentReviewStatus: '已通过',
    hasChange: false,
    scheduleImpactFlag: false,
    isReadyForConstruction: true,
    isReadyForAcceptance: false,
    drawingsCount: 3,
    requiredItemsCount: 3,
    latestUpdateAt: '2026-04-15T00:00:00.000Z',
  }

  const versions: DrawingVersionView[] = [
    {
      versionId: 'version-current',
      drawingId: 'drawing-current',
      parentDrawingId: null,
      versionNo: '3.0',
      revisionNo: 'R3',
      issuedFor: '施工执行',
      effectiveDate: '2026-04-15',
      previousVersionId: 'version-history',
      isCurrentVersion: true,
      supersededAt: null,
      changeReason: '当前有效施工版',
      createdAt: '2026-04-15T00:00:00.000Z',
      createdBy: '张三',
      drawingName: '结构施工图',
    },
    {
      versionId: 'version-history',
      drawingId: 'drawing-history',
      parentDrawingId: null,
      versionNo: '2.0',
      revisionNo: 'R2',
      issuedFor: '施工执行',
      effectiveDate: '2026-04-01',
      previousVersionId: null,
      isCurrentVersion: false,
      supersededAt: '2026-04-15T00:00:00.000Z',
      changeReason: '历史归档版',
      createdAt: '2026-04-01T00:00:00.000Z',
      createdBy: '李四',
      drawingName: '结构施工图',
    },
  ]

  let container: HTMLDivElement
  let root: Root | null = null
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  function render(node: ReactElement) {
    act(() => {
      root?.render(node)
    })
  }

  function setTextInputValue(element: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
    if (!element) return
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
    descriptor?.set?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    consoleErrorSpy.mockRestore()
    document.body.innerHTML = ''
  })

  it('keeps the current version labeled and hides the switch action for it', () => {
    const onOpenChange = vi.fn()
    const onSetCurrentVersion = vi.fn()

    render(
      <MemoryRouter>
        <DrawingVersionDialog
          open
          packageCard={packageCard}
          versions={versions}
          onOpenChange={onOpenChange}
          onSetCurrentVersion={onSetCurrentVersion}
        />
      </MemoryRouter>,
    )

    const body = document.body
    const currentRow = body.querySelector('[data-testid="drawing-version-row-version-current"]') as HTMLElement | null
    const historyRow = body.querySelector('[data-testid="drawing-version-row-version-history"]') as HTMLElement | null

    expect(body.textContent).toContain('当前有效版')
    expect(currentRow).toBeTruthy()
    expect(historyRow).toBeTruthy()
    expect(currentRow?.textContent).toContain('当前有效版')
    expect(currentRow?.querySelectorAll('button')).toHaveLength(1)
    expect(historyRow?.querySelector('button')).toBeTruthy()
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringContaining('validateDOMNesting'))
  })

  it('opens a create form and submits a new version draft', async () => {
    const onOpenChange = vi.fn()
    const onSetCurrentVersion = vi.fn()
    const onCreateVersion = vi.fn(async () => true)

    render(
      <MemoryRouter>
        <DrawingVersionDialog
          open
          packageCard={packageCard}
          versions={versions}
          onOpenChange={onOpenChange}
          onSetCurrentVersion={onSetCurrentVersion}
          onCreateVersion={onCreateVersion}
        />
      </MemoryRouter>,
    )

    const body = document.body
    const openButton = body.querySelector('[data-testid="drawing-version-upload-btn"]') as HTMLButtonElement | null
    expect(openButton).toBeTruthy()

    await act(async () => {
      openButton?.click()
      await Promise.resolve()
    })

    const nameInput = body.querySelector('[data-testid="drawing-version-create-name"]') as HTMLInputElement | null
    const codeInput = body.querySelector('[data-testid="drawing-version-create-code"]') as HTMLInputElement | null
    const versionInput = body.querySelector('[data-testid="drawing-version-create-version"]') as HTMLInputElement | null
    const reasonInput = body.querySelector('[data-testid="drawing-version-create-reason"]') as HTMLTextAreaElement | null
    const currentCheckbox = body.querySelector('[data-testid="drawing-version-create-current"]') as HTMLInputElement | null
    const submitButton = body.querySelector('[data-testid="drawing-version-create-submit"]') as HTMLButtonElement | null

    expect(nameInput).toBeTruthy()
    expect(versionInput?.value).toBe('3.1')

    await act(async () => {
      setTextInputValue(nameInput, '结构施工图-新版')
      setTextInputValue(codeInput, 'JG-003')
      setTextInputValue(versionInput, '3.1')
      setTextInputValue(reasonInput, '补充楼板节点')
      if (currentCheckbox && !currentCheckbox.checked) {
        currentCheckbox.click()
      }
      await Promise.resolve()
      submitButton?.click()
      await Promise.resolve()
    })

    expect(onCreateVersion).toHaveBeenCalledWith({
      drawingName: '结构施工图-新版',
      drawingCode: 'JG-003',
      versionNo: '3.1',
      changeReason: '补充楼板节点',
      isCurrentVersion: true,
    })
  })
})
