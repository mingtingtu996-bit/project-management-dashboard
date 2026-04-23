import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useLocation } from 'react-router-dom'

const DEFAULT_MESSAGE =
  '\u5f53\u524d\u5185\u5bb9\u5c1a\u672a\u4fdd\u5b58\uff0c\u79bb\u5f00\u540e\u66f4\u6539\u5c06\u4e22\u5931\uff0c\u786e\u8ba4\u7ee7\u7eed\u5417\uff1f'
const DEFAULT_TITLE = '\u786e\u8ba4\u79bb\u5f00\u5f53\u524d\u9875\u9762\uff1f'

function getCurrentHash() {
  if (typeof window === 'undefined') {
    return '#/'
  }

  return window.location.hash || '#/'
}

function isPlainLeftClick(event: MouseEvent) {
  return (
    event.button === 0
    && !event.defaultPrevented
    && !event.metaKey
    && !event.altKey
    && !event.ctrlKey
    && !event.shiftKey
  )
}

export interface UnsavedChangesConfirmDialogState {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function useUnsavedChangesGuard(enabled: boolean, message = DEFAULT_MESSAGE) {
  const location = useLocation()
  const confirmedHashRef = useRef(getCurrentHash())
  const restoringRef = useRef(false)
  const pendingHashRef = useRef<string | null>(null)
  const pendingActionRef = useRef<(() => void) | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const cancelPendingNavigation = useCallback(() => {
    pendingHashRef.current = null
    pendingActionRef.current = null
    setDialogOpen(false)
  }, [])

  const confirmPendingNavigation = useCallback(() => {
    const nextHash = pendingHashRef.current
    const pendingAction = pendingActionRef.current
    pendingHashRef.current = null
    pendingActionRef.current = null
    setDialogOpen(false)

    if (pendingAction) {
      pendingAction()
      return
    }

    if (!nextHash) {
      return
    }

    restoringRef.current = true
    confirmedHashRef.current = nextHash
    window.location.hash = nextHash
  }, [])

  const guardNavigation = useCallback((action: () => void) => {
    if (!enabled) {
      action()
      return
    }

    pendingHashRef.current = null
    pendingActionRef.current = action
    flushSync(() => {
      setDialogOpen(true)
    })
  }, [enabled])

  useEffect(() => {
    confirmedHashRef.current = getCurrentHash()
  }, [enabled, location.pathname, location.search, location.hash])

  useEffect(() => {
    if (!enabled) {
      cancelPendingNavigation()
    }
  }, [cancelPendingNavigation, enabled])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
      return ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const handleDocumentClick = (event: MouseEvent) => {
      if (!isPlainLeftClick(event)) {
        return
      }

      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      const anchor = target.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement)) {
        return
      }

      if (anchor.target && anchor.target !== '_self') {
        return
      }

      const nextUrl = new URL(anchor.href, window.location.href)
      if (nextUrl.origin !== window.location.origin) {
        return
      }

      const nextHash = nextUrl.hash || '#/'
      if (nextHash === confirmedHashRef.current) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      pendingHashRef.current = nextHash
      flushSync(() => {
        setDialogOpen(true)
      })
    }

    document.addEventListener('click', handleDocumentClick, true)
    return () => {
      document.removeEventListener('click', handleDocumentClick, true)
    }
  }, [enabled])

  useEffect(() => {
    const handleHashChange = (event: HashChangeEvent) => {
      const nextHash = new URL(event.newURL).hash || '#/'

      if (restoringRef.current) {
        restoringRef.current = false
        confirmedHashRef.current = getCurrentHash()
        return
      }

      if (!enabled) {
        confirmedHashRef.current = nextHash
        return
      }

      if (nextHash === confirmedHashRef.current) {
        return
      }

      event.stopImmediatePropagation?.()
      pendingHashRef.current = nextHash
      flushSync(() => {
        setDialogOpen(true)
      })
      restoringRef.current = true
      window.location.hash = confirmedHashRef.current
    }

    window.addEventListener('hashchange', handleHashChange, true)
    return () => {
      window.removeEventListener('hashchange', handleHashChange, true)
    }
  }, [enabled, message])

  const confirmDialog = useMemo<UnsavedChangesConfirmDialogState>(
    () => ({
      open: dialogOpen,
      title: DEFAULT_TITLE,
      description: message,
      confirmLabel: '\u786e\u8ba4\u79bb\u5f00',
      cancelLabel: '\u7ee7\u7eed\u7f16\u8f91',
      onOpenChange: (open) => {
        if (!open) {
          cancelPendingNavigation()
        }
      },
      onConfirm: confirmPendingNavigation,
    }),
    [cancelPendingNavigation, confirmPendingNavigation, dialogOpen, message],
  )

  return { confirmDialog, confirmPendingNavigation, cancelPendingNavigation, guardNavigation }
}
