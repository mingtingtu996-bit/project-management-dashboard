import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConditionWarningModal } from '../ConditionWarningModal'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: vi.fn(),
  }
})

const mockedUseNavigate = vi.mocked(useNavigate)

describe('ConditionWarningModal', () => {
  const navigateMock = vi.fn()
  const container = document.createElement('div')
  let root: Root | null = null
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    throw new Error('fetch should not be called')
  })

  beforeEach(() => {
    document.body.appendChild(container)
    container.innerHTML = ''
    root = createRoot(container)
    mockedUseNavigate.mockReturnValue(navigateMock)
  })

  afterEach(() => {
    mockedUseNavigate.mockReset()
    navigateMock.mockReset()
    act(() => {
      root?.unmount()
    })
    root = null
    container.remove()
  })

  it('stays closed by default and does not fetch warnings', async () => {
    await act(async () => {
      root?.render(<ConditionWarningModal projectId="project-1" />)
      await Promise.resolve()
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('提醒汇总')
    expect(document.body.textContent).not.toContain('去问题与风险')
  })

  it('supports a controlled open state and routes to the project risk page', async () => {
    await act(async () => {
      root?.render(
        <ConditionWarningModal
          projectId="project-1"
          open
          taskTitle="主体结构施工"
          pendingConditionCount={2}
        />,
      )
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain('提醒汇总')
    expect(document.body.textContent).toContain('主体结构施工')
    expect(document.body.textContent).toContain('仍有 2 项未满足开工条件')

    const goButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('去问题与风险'),
    )
    expect(goButton).toBeTruthy()

    await act(async () => {
      goButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })

    expect(navigateMock).toHaveBeenCalledWith('/projects/project-1/risks')
  })
})
