import { lazy, Suspense } from 'react'

import type { GanttViewDialogsProps } from '../GanttViewDialogs'

const LazyGanttViewDialogs = lazy(() =>
  import('../GanttViewDialogs').then((module) => ({ default: module.GanttViewDialogs })),
)

type GanttEditWorkflowDialogsProps = GanttViewDialogsProps & {
  shouldRender: boolean
}

export function GanttEditWorkflowDialogs({
  shouldRender,
  ...dialogProps
}: GanttEditWorkflowDialogsProps) {
  if (!shouldRender) return null

  return (
    <Suspense fallback={null}>
      <LazyGanttViewDialogs {...dialogProps} />
    </Suspense>
  )
}
