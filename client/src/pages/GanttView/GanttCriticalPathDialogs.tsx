import { lazy, Suspense, type Dispatch, type SetStateAction } from 'react'
import type { NavigateFunction } from 'react-router-dom'

import type {
  CriticalPathOverrideInput,
  CriticalPathOverrideRecord,
  CriticalPathSummaryModel,
} from '@/lib/criticalPath'

import type { Task } from '../GanttViewTypes'
import { CriticalPathInsertDialog } from './CriticalPathInsertDialog'

const LazyCriticalPathDialog = lazy(() =>
  import('./CriticalPathDialog').then((module) => ({ default: module.CriticalPathDialog })),
)

type CriticalPathInsertRequest = {
  anchorTaskId: string
  direction: 'before' | 'after'
}

type GanttCriticalPathDialogsProps = {
  actionLoading: boolean
  currentProjectName?: string | null
  dialogLoading: boolean
  dialogOpen: boolean
  error: string | null
  focusTaskId: string | null
  insertAnchorTask: Task | null
  insertRequest: CriticalPathInsertRequest | null
  navigate: NavigateFunction
  onCreateOverride: (input: CriticalPathOverrideInput) => Promise<void>
  onDeleteOverride: (taskOrOverrideId: string, mode?: 'manual_attention' | 'manual_insert') => Promise<void>
  onRefresh: () => Promise<void>
  overrides: CriticalPathOverrideRecord[]
  projectId?: string | null
  setDialogOpen: Dispatch<SetStateAction<boolean>>
  setFocusTaskId: Dispatch<SetStateAction<string | null>>
  setInsertRequest: Dispatch<SetStateAction<CriticalPathInsertRequest | null>>
  summary: CriticalPathSummaryModel | null
  tasks: Task[]
}

export function GanttCriticalPathDialogs({
  actionLoading,
  currentProjectName,
  dialogLoading,
  dialogOpen,
  error,
  focusTaskId,
  insertAnchorTask,
  insertRequest,
  navigate,
  onCreateOverride,
  onDeleteOverride,
  onRefresh,
  overrides,
  projectId,
  setDialogOpen,
  setFocusTaskId,
  setInsertRequest,
  summary,
  tasks,
}: GanttCriticalPathDialogsProps) {
  return (
    <>
      {dialogOpen && (
        <Suspense fallback={null}>
          <LazyCriticalPathDialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open)
              if (!open) setFocusTaskId(null)
            }}
            projectName={currentProjectName ?? undefined}
            tasks={tasks}
            snapshot={summary?.snapshot ?? null}
            overrides={overrides}
            focusTaskId={focusTaskId}
            loading={dialogLoading}
            error={error}
            actionLoading={actionLoading}
            onRefresh={onRefresh}
            onCreateOverride={onCreateOverride}
            onDeleteOverride={onDeleteOverride}
            onNodeNavigate={(taskId) => {
              setDialogOpen(false)
              setFocusTaskId(null)
              if (!projectId) return
              navigate(`/projects/${projectId}/gantt?highlight=${encodeURIComponent(taskId)}`)
            }}
          />
        </Suspense>
      )}

      {insertRequest && (
        <Suspense fallback={null}>
          <CriticalPathInsertDialog
            open
            onOpenChange={(open) => {
              if (!open) {
                setInsertRequest(null)
              }
            }}
            anchorTask={insertAnchorTask}
            direction={insertRequest.direction}
            tasks={tasks}
            snapshot={summary?.snapshot ?? null}
            actionLoading={actionLoading}
            onCreateOverride={async (input) => {
              await onCreateOverride(input)
            }}
          />
        </Suspense>
      )}
    </>
  )
}
