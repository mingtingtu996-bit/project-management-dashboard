import { useCallback, useRef, useState } from 'react'

import { toast } from '@/hooks/use-toast'

export function useLoadingButton(asyncFn: () => Promise<void>, timeoutMs = 10000) {
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (!timerRef.current) return
    clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const run = useCallback(async () => {
    if (loading) return

    setLoading(true)
    timerRef.current = setTimeout(() => {
      setLoading(false)
      toast({ title: '操作超时，请重试' })
    }, timeoutMs)

    try {
      await asyncFn()
    } catch {
      toast({ title: '操作失败' })
    } finally {
      clearTimer()
      setLoading(false)
    }
  }, [asyncFn, clearTimer, loading, timeoutMs])

  return { loading, run }
}
