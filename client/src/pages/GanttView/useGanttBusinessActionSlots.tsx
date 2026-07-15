import { useCallback, useMemo, type Dispatch, type RefObject, type SetStateAction } from 'react'

import { TaskListBusinessActions, TaskListEditBusinessActions } from './TaskListBusinessActions'
import type { TaskTimelineViewHandle } from './TaskTimelineView'

type UseGanttBusinessActionSlotsInput = {
  baselineActionPending?: boolean
  baselineStatusKnown?: boolean
  canEdit: boolean
  hasBaseline?: boolean
  onOpenCriticalPath: (taskId?: string | null) => void
  onOpenBaselineGovernance?: () => void
  onOpenFilters?: () => void
  onOpenTaskListWizard: () => void
  onImportTasks?: (file: File) => void
  onOpenReconcile?: () => void
  onOpenSaveCompanyTemplate?: () => void
  projectId?: string
  selectedTaskId?: string | null
  setExportOpen: Dispatch<SetStateAction<boolean>>
  setEngineeringObjectsOpen: Dispatch<SetStateAction<boolean>>
  timelineViewRef: RefObject<TaskTimelineViewHandle | null>
  viewMode: string
}

export function useGanttBusinessActionSlots({
  baselineActionPending = false,
  baselineStatusKnown = true,
  canEdit,
  hasBaseline = false,
  onOpenCriticalPath,
  onOpenBaselineGovernance,
  onOpenFilters,
  onOpenTaskListWizard,
  onImportTasks,
  onOpenReconcile,
  onOpenSaveCompanyTemplate,
  projectId,
  selectedTaskId,
  setExportOpen,
  setEngineeringObjectsOpen,
  timelineViewRef,
  viewMode,
}: UseGanttBusinessActionSlotsInput) {
  const handleOpenEngineeringObjects = useCallback(() => {
    if (!projectId) return
    setEngineeringObjectsOpen(true)
  }, [projectId, setEngineeringObjectsOpen])

  const scrollTaskWorkspaceToToday = useCallback(() => {
    if (viewMode === 'gantt') {
      timelineViewRef.current?.scrollToToday()
      return
    }

    const firstTodayEl = document.querySelector<HTMLElement>('[data-today-active="true"]')
    if (firstTodayEl) {
      firstTodayEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else {
      document.querySelector('[data-testid="gantt-task-rows"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [timelineViewRef, viewMode])

  const openCriticalPathForSelectedTask = useCallback(() => {
    onOpenCriticalPath(selectedTaskId)
  }, [onOpenCriticalPath, selectedTaskId])

  const openExport = useCallback(() => {
    setExportOpen(true)
  }, [setExportOpen])

  const taskListBusinessActions = useMemo(() => (
    <TaskListBusinessActions
      baselineActionPending={baselineActionPending}
      baselineStatusKnown={baselineStatusKnown}
      canEdit={canEdit}
      hasBaseline={hasBaseline}
      onOpenEngineeringObjects={handleOpenEngineeringObjects}
      onOpenCriticalPath={openCriticalPathForSelectedTask}
      onOpenBaselineGovernance={onOpenBaselineGovernance}
      onGenerateTasks={onOpenTaskListWizard}
      onImportTasks={onImportTasks}
      onOpenExport={openExport}
      onOpenFilters={onOpenFilters}
      onOpenReconcile={onOpenReconcile}
      onOpenSaveCompanyTemplate={onOpenSaveCompanyTemplate}
      onScrollToToday={scrollTaskWorkspaceToToday}
    />
  ), [
    baselineActionPending,
    baselineStatusKnown,
    canEdit,
    hasBaseline,
    handleOpenEngineeringObjects,
    onImportTasks,
    onOpenBaselineGovernance,
    onOpenFilters,
    onOpenReconcile,
    onOpenSaveCompanyTemplate,
    onOpenTaskListWizard,
    openCriticalPathForSelectedTask,
    openExport,
    scrollTaskWorkspaceToToday,
  ])

  const taskListEditBusinessActions = useMemo(() => (
    <TaskListEditBusinessActions
      baselineActionPending={baselineActionPending}
      baselineStatusKnown={baselineStatusKnown}
      canEdit={canEdit}
      hasBaseline={hasBaseline}
      onOpenEngineeringObjects={handleOpenEngineeringObjects}
      onOpenCriticalPath={openCriticalPathForSelectedTask}
      onOpenBaselineGovernance={onOpenBaselineGovernance}
      onGenerateTasks={onOpenTaskListWizard}
      onImportTasks={onImportTasks}
      onOpenExport={openExport}
      onOpenFilters={onOpenFilters}
      onOpenReconcile={onOpenReconcile}
      onOpenSaveCompanyTemplate={onOpenSaveCompanyTemplate}
      onScrollToToday={scrollTaskWorkspaceToToday}
    />
  ), [
    baselineActionPending,
    baselineStatusKnown,
    canEdit,
    hasBaseline,
    handleOpenEngineeringObjects,
    onImportTasks,
    onOpenBaselineGovernance,
    onOpenFilters,
    onOpenReconcile,
    onOpenSaveCompanyTemplate,
    onOpenTaskListWizard,
    openCriticalPathForSelectedTask,
    openExport,
    scrollTaskWorkspaceToToday,
  ])

  return {
    handleOpenEngineeringObjects,
    scrollTaskWorkspaceToToday,
    taskListBusinessActions,
    taskListEditBusinessActions,
  }
}
