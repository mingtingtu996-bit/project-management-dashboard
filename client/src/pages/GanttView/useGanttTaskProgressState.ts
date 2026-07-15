import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react'

import {
  buildProjectTaskProgressSnapshot,
} from '@/lib/taskBusinessStatus'
import type { Task, TaskCondition, TaskObstacle } from '../GanttViewTypes'
import { getTaskProgressReadOnlyReason } from '../GanttViewTypes'
import {
  buildBlockedProgressTaskIds,
  getTaskConditionsForTask,
} from './ganttViewUtils'

type ConditionWarningTarget = {
  taskId: string
  taskTitle: string
  pendingConditionCount: number
}

type UseGanttTaskProgressStateInput = {
  editingTask: Task | null
  projectConditions: TaskCondition[]
  projectObstacles: TaskObstacle[]
  setConditionWarningTarget: Dispatch<SetStateAction<ConditionWarningTarget | null>>
  tasks: Task[]
}

export function useGanttTaskProgressState({
  editingTask,
  projectConditions,
  projectObstacles,
  setConditionWarningTarget,
  tasks,
}: UseGanttTaskProgressStateInput) {
  const editingTaskConditions = useMemo(
    () => getTaskConditionsForTask(editingTask?.id, projectConditions),
    [editingTask, projectConditions],
  )
  const unmetEditingTaskConditions = editingTaskConditions.filter((condition) => !condition.is_satisfied)
  const editingProgressReadOnlyReason = getTaskProgressReadOnlyReason(editingTask?.progress_method)
  const progressInputBlocked = Boolean(editingProgressReadOnlyReason)
    || (unmetEditingTaskConditions.length > 0 && Number(editingTask?.progress ?? 0) > 0)
  const progressInputHint = editingProgressReadOnlyReason
    ?? (progressInputBlocked
      ? '仍有 ' + unmetEditingTaskConditions.length + ' 项开工条件未满足，请先处理条件后再填报进度。'
      : unmetEditingTaskConditions.length > 0
        ? '当前仍有 ' + unmetEditingTaskConditions.length + ' 项开工条件未满足，首次填报后会弹出条件预警提醒。'
        : '任务进度会同步驱动业务状态。')

  const openConditionWarning = useCallback((task: Pick<Task, 'title'> & { id?: string }, pendingConditionCount: number) => {
    setConditionWarningTarget({
      taskId: String(task.id ?? ''),
      taskTitle: String(task.title || '当前任务'),
      pendingConditionCount,
    })
  }, [setConditionWarningTarget])

  const taskProgressSnapshot = useMemo(
    () => buildProjectTaskProgressSnapshot(tasks, projectConditions, projectObstacles),
    [projectConditions, projectObstacles, tasks],
  )

  const blockedProgressTaskIds = useMemo(
    () => buildBlockedProgressTaskIds(tasks, taskProgressSnapshot.taskConditionMap),
    [taskProgressSnapshot.taskConditionMap, tasks],
  )

  return {
    blockedProgressTaskIds,
    editingProgressReadOnlyReason,
    editingTaskConditions,
    openConditionWarning,
    progressInputBlocked,
    progressInputHint,
    taskProgressSnapshot,
    unmetEditingTaskConditions,
  }
}
