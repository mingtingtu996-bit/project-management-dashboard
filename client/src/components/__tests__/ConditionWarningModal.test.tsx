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
})
