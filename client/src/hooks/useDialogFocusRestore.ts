import { useEffect, useRef } from 'react'

export function useDialogFocusRestore(open: boolean) {
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      return
    }

    if (lastFocusedRef.current) {
      lastFocusedRef.current.focus()
      lastFocusedRef.current = null
    }
  }, [open])
}

