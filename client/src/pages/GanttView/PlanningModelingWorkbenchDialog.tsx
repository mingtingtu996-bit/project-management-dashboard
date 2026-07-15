import { Suspense, lazy } from 'react'

const LazyProjectInfoModule = lazy(() => import('@/pages/ProjectInfoModule/ProjectInfoModule'))
const LazyTaskPlanDrilldownWorkbench = lazy(() => import('./TaskPlanDrilldownWorkbench'))

export type PlanningModelingWorkbenchMode = 'generate' | 'adjust' | 'expand'

export interface PlanningModelingWorkbenchDialogProps {
  open: boolean
  mode: PlanningModelingWorkbenchMode
  projectId: string
  taskId?: string | null
  onOpenChange: (open: boolean) => void
  onGenerated: (projectId: string, targetParams: string) => void
}

export function PlanningModelingWorkbenchDialog({
  open,
  mode,
  projectId,
  taskId,
  onOpenChange,
  onGenerated,
}: PlanningModelingWorkbenchDialogProps) {
  if (!open) return null

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="planning-modeling-workbench-title"
      aria-describedby="planning-modeling-workbench-description"
      className="fixed inset-0 z-50 flex min-h-screen flex-col overflow-hidden bg-slate-50"
      data-testid="planning-modeling-workbench-dialog"
    >
      <div className="sr-only">
        <h2 id="planning-modeling-workbench-title">Planning modeling workbench</h2>
        <p id="planning-modeling-workbench-description">
          Project modeling, task generation, plan import, and template adjustment in the task-list context.
        </p>
      </div>
      <Suspense
        fallback={(
          <div className="flex h-full items-center justify-center bg-slate-50 text-sm text-slate-500">
            Opening planning modeling workbench...
          </div>
        )}
      >
        {mode === 'expand' ? (
          taskId ? (
            <LazyTaskPlanDrilldownWorkbench
              projectId={projectId}
              taskId={taskId}
              onClose={() => onOpenChange(false)}
              onCommitted={() => onGenerated(projectId, 'task_drilldown_saved=true')}
            />
          ) : (
            <div role="alert" className="flex h-full items-center justify-center bg-slate-50 text-sm text-red-600">
              未选择下钻任务
            </div>
          )
        ) : (
          <LazyProjectInfoModule
            embedded
            projectId={projectId}
            initialMode={mode}
            autosaveEnabled={false}
            onExit={() => onOpenChange(false)}
            onGenerated={onGenerated}
          />
        )}
      </Suspense>
    </section>
  )
}

export default PlanningModelingWorkbenchDialog
