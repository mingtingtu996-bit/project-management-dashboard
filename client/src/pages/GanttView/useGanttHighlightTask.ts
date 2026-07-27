import { useEffect, useRef } from 'react'

type UseGanttHighlightTaskInput = {
  loading: boolean
  taskId?: string | null
}

export function useGanttHighlightTask({
  loading,
  taskId,
}: UseGanttHighlightTaskInput) {
  const highlightScrollTimerRef = useRef<number | null>(null)
  const highlightClearTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (highlightScrollTimerRef.current) {
      clearTimeout(highlightScrollTimerRef.current)
      highlightScrollTimerRef.current = null
    }
    if (highlightClearTimerRef.current) {
      clearTimeout(highlightClearTimerRef.current)
      highlightClearTimerRef.current = null
    }

    if (!taskId || loading) return

    highlightScrollTimerRef.current = window.setTimeout(() => {
      const el = document.getElementById(`gantt-task-row-${taskId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('!bg-amber-50/60', 'ring-1', 'ring-inset', 'ring-amber-300')
        highlightClearTimerRef.current = window.setTimeout(() => {
          el.classList.remove('!bg-amber-50/60', 'ring-1', 'ring-inset', 'ring-amber-300')
          highlightClearTimerRef.current = null
        }, 3000)
      }
    }, 400)

    return () => {
      if (highlightScrollTimerRef.current) {
        clearTimeout(highlightScrollTimerRef.current)
        highlightScrollTimerRef.current = null
      }
      if (highlightClearTimerRef.current) {
        clearTimeout(highlightClearTimerRef.current)
        highlightClearTimerRef.current = null
      }
      const el = document.getElementById(`gantt-task-row-${taskId}`)
      el?.classList.remove('!bg-amber-50/60', 'ring-1', 'ring-inset', 'ring-amber-300')
    }
  }, [loading, taskId])
}
