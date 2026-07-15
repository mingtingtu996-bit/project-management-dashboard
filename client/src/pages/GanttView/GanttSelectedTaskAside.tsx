import { lazy, Suspense } from 'react'
import type { NavigateFunction } from 'react-router-dom'

import { LoadingState } from '@/components/ui/loading-state'
import { Card, CardContent } from '@/components/ui/card'
import type { TaskDetailPanelProps } from '../GanttViewPanels'
import type { Task } from '../GanttViewTypes'

const loadTaskDetailPanel = () =>
  import('../GanttViewPanels').then((module) => ({ default: module.TaskDetailPanel }))

export function preloadTaskDetailPanel() {
  void loadTaskDetailPanel()
}

const LazyTaskDetailPanel = lazy(loadTaskDetailPanel)

type GanttSelectedTaskAsideProps = Omit<
  TaskDetailPanelProps,
  'projectId' | 'selectedTask' | 'onClose' | 'onOpenChangeLogs'
> & {
  navigate: NavigateFunction
  projectId?: string | null
  selectedTask: Task | null
  setSelectedTask: (task: Task | null) => void
}

export function GanttSelectedTaskAside({
  navigate,
  projectId,
  selectedTask,
  setSelectedTask,
  ...panelProps
}: GanttSelectedTaskAsideProps) {
  if (!selectedTask) return null

  return (
    <aside data-testid="task-workspace-layer-l5" className="relative z-40 space-y-4">
      <Suspense
        fallback={
          <Card variant="detail">
            <CardContent className="p-5">
              <LoadingState label="正在加载任务详情" className="min-h-[18rem]" />
            </CardContent>
          </Card>
        }
      >
        <LazyTaskDetailPanel
          {...panelProps}
          projectId={projectId || ''}
          selectedTask={selectedTask}
          onClose={() => setSelectedTask(null)}
          onOpenChangeLogs={() => navigate(`/projects/${projectId}/reports?view=progress_deviation&taskId=${selectedTask.id}`)}
        />
      </Suspense>
    </aside>
  )
}
