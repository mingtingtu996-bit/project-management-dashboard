import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { HashRouter, Link, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfirmActionDialog } from '@/components/ConfirmActionDialog'
import { useUnsavedChangesGuard } from '../useUnsavedChangesGuard'

function GuardedPage({ enabled }: { enabled: boolean }) {
  const { confirmDialog } = useUnsavedChangesGuard(enabled, 'unsaved changes')

  return (
    <>
      <div>guarded</div>
      <Link to="/next">go next</Link>
      <ConfirmActionDialog {...confirmDialog} />
    </>
  )
}

function delay(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let container: HTMLDivElement | null = null
let root: Root | null = null

async function renderGuard(enabled = true) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root?.render(
      <HashRouter>
        <Routes>
          <Route path="/start" element={<GuardedPage enabled={enabled} />} />
          <Route path="/next" element={<div>next</div>} />
        </Routes>
      </HashRouter>,
    )
    await delay()
  })
}

describe('useUnsavedChangesGuard', () => {
  beforeEach(() => {
    window.location.hash = '#/start'
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    if (root) {
      await act(async () => {
        root?.unmount()
        await delay()
      })
    }
    root = null
    container?.remove()
    container = null
    window.location.hash = '#/'
  })

  it('reverts hash navigation when the user cancels leaving', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    await renderGuard(true)

    await act(async () => {
      const nextLink = Array.from(document.querySelectorAll('a')).find((link) =>
        link.textContent?.includes('go next'),
      )
      expect(nextLink).toBeTruthy()
      nextLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
      await delay()
    })

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('unsaved changes')
    expect(window.location.hash).toBe('#/start')

    const cancelButton = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('继续编辑'),
    )
    expect(cancelButton).toBeTruthy()

    await act(async () => {
      cancelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await delay()
    })

    expect(window.location.hash).toBe('#/start')
  })

  it('allows hash navigation when the user confirms leaving', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    await renderGuard(true)

    await act(async () => {
      const nextLink = Array.from(document.querySelectorAll('a')).find((link) =>
        link.textContent?.includes('go next'),
      )
      expect(nextLink).toBeTruthy()
      nextLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
      await delay()
    })

    expect(confirmSpy).not.toHaveBeenCalled()

    const confirmButton = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('确认离开'),
    )
    expect(confirmButton).toBeTruthy()

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await delay()
    })

    expect(window.location.hash).toBe('#/next')
  })

  it('registers beforeunload protection while unsaved changes exist', async () => {
    await renderGuard(true)

    let returnValue: unknown = undefined
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
    Object.defineProperty(event, 'returnValue', {
      configurable: true,
      get: () => returnValue,
      set: (value) => {
        returnValue = value
      },
    })

    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(returnValue).toBe('')
  })

  it('does not intercept navigation when guard is disabled', async () => {
    await renderGuard(false)

    await act(async () => {
      const nextLink = Array.from(document.querySelectorAll('a')).find((link) =>
        link.textContent?.includes('go next'),
      )
      expect(nextLink).toBeTruthy()
      nextLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
      await delay()
    })

    expect(document.body.textContent).not.toContain('unsaved changes')
    expect(window.location.hash).toBe('#/next')
  })

  it('does not block beforeunload when guard is disabled', async () => {
    await renderGuard(false)

    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })
})
