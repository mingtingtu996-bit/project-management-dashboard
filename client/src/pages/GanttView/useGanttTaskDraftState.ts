import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { toast } from '@/hooks/use-toast'

import type { Task } from '../GanttViewTypes'
import {
  areTaskTableDraftPatchesEqual,
  buildTaskTableDraftDeletedIds,
  buildTaskTableDraftRows,
  cloneTaskTableDraftPatches,
  compactTaskTableDraftPatches,
  hasTaskTableDraftPatches,
  mapTaskDraftPatchToCellKeys,
  type TaskTableDraftPatches,
} from './taskDraftUtils'

type UseGanttTaskDraftStateInput = {
  canEdit: boolean
  projectId?: string
  tasks: Task[]
}

export function useGanttTaskDraftState({
  canEdit,
  projectId,
  tasks,
}: UseGanttTaskDraftStateInput) {
  const [taskTableEditing, setTaskTableEditing] = useState(false)
  const [taskTableDraftPatches, setTaskTableDraftPatches] = useState<TaskTableDraftPatches>({})
  const taskTableDraftHistoryRef = useRef<TaskTableDraftPatches[]>([{}])
  const taskTableDraftHistoryCursorRef = useRef(0)
  const [taskTableDraftHistoryVersion, setTaskTableDraftHistoryVersion] = useState(0)

  const taskTableDraftDeletedIds = useMemo(() => {
    return buildTaskTableDraftDeletedIds(taskTableDraftPatches)
  }, [taskTableDraftPatches])

  const taskTableDraftRows = useMemo(() => {
    return buildTaskTableDraftRows({
      tasks,
      draftPatches: taskTableDraftPatches,
      deletedIds: taskTableDraftDeletedIds,
      projectId,
    })
  }, [projectId, taskTableDraftDeletedIds, taskTableDraftPatches, tasks])

  const recordTaskTableDraftPatches = useCallback((updater: (current: TaskTableDraftPatches) => TaskTableDraftPatches) => {
    setTaskTableDraftPatches((current) => {
      const next = compactTaskTableDraftPatches(updater(cloneTaskTableDraftPatches(current)), tasks)
      if (areTaskTableDraftPatchesEqual(current, next)) return current

      const nextSnapshot = cloneTaskTableDraftPatches(next)
      const currentCursor = taskTableDraftHistoryCursorRef.current
      const nextHistory = taskTableDraftHistoryRef.current.slice(0, currentCursor + 1)
      nextHistory.push(nextSnapshot)
      taskTableDraftHistoryRef.current = nextHistory
      taskTableDraftHistoryCursorRef.current = nextHistory.length - 1
      setTaskTableDraftHistoryVersion((value) => value + 1)
      return nextSnapshot
    })
  }, [tasks])

  const resetTaskTableDraftPatches = useCallback(() => {
    taskTableDraftHistoryRef.current = [{}]
    taskTableDraftHistoryCursorRef.current = 0
    setTaskTableDraftPatches({})
    setTaskTableDraftHistoryVersion((value) => value + 1)
  }, [])

  useEffect(() => {
    resetTaskTableDraftPatches()
    setTaskTableEditing(false)
  }, [projectId, resetTaskTableDraftPatches])

  const enqueueTaskTableDraftPatch = useCallback((taskId: string, patch: Partial<Task>) => {
    if (!taskId || Object.keys(patch).length === 0) return
    setTaskTableEditing(true)
    recordTaskTableDraftPatches((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? {}),
        ...patch,
      },
    }))
  }, [recordTaskTableDraftPatches])

  const taskTableHistoryCursor = taskTableDraftHistoryVersion >= 0
    ? taskTableDraftHistoryCursorRef.current
    : 0
  const canUndoTaskTableDraft = taskTableHistoryCursor > 0
  const canRedoTaskTableDraft = taskTableHistoryCursor < taskTableDraftHistoryRef.current.length - 1

  const taskTableDraftDirtyRowIds = useMemo(
    () => new Set(Object.keys(taskTableDraftPatches)),
    [taskTableDraftPatches],
  )

  const taskTableDraftDirtyCellMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const [taskId, patch] of Object.entries(taskTableDraftPatches)) {
      const keys = mapTaskDraftPatchToCellKeys(patch)
      if (keys.size > 0) map.set(taskId, keys)
    }
    return map
  }, [taskTableDraftPatches])

  const handleUndoTaskTableDraft = useCallback(() => {
    if (taskTableDraftHistoryCursorRef.current <= 0) return
    taskTableDraftHistoryCursorRef.current -= 1
    const snapshot = taskTableDraftHistoryRef.current[taskTableDraftHistoryCursorRef.current] ?? {}
    setTaskTableDraftPatches(cloneTaskTableDraftPatches(snapshot))
    setTaskTableDraftHistoryVersion((value) => value + 1)
  }, [])

  const handleRedoTaskTableDraft = useCallback(() => {
    if (taskTableDraftHistoryCursorRef.current >= taskTableDraftHistoryRef.current.length - 1) return
    taskTableDraftHistoryCursorRef.current += 1
    const snapshot = taskTableDraftHistoryRef.current[taskTableDraftHistoryCursorRef.current] ?? {}
    setTaskTableDraftPatches(cloneTaskTableDraftPatches(snapshot))
    setTaskTableDraftHistoryVersion((value) => value + 1)
  }, [])

  const handleStartTaskTableDraft = useCallback(() => {
    if (!canEdit) return
    setTaskTableEditing(true)
  }, [canEdit])

  const handleCancelTaskTableDraft = useCallback(() => {
    if (!taskTableEditing && !hasTaskTableDraftPatches(taskTableDraftPatches)) return
    resetTaskTableDraftPatches()
    setTaskTableEditing(false)
    toast({ title: hasTaskTableDraftPatches(taskTableDraftPatches) ? '已取消表格编辑' : '已退出表格编辑' })
  }, [resetTaskTableDraftPatches, taskTableDraftPatches, taskTableEditing])

  return {
    canRedoTaskTableDraft,
    canUndoTaskTableDraft,
    enqueueTaskTableDraftPatch,
    handleCancelTaskTableDraft,
    handleRedoTaskTableDraft,
    handleStartTaskTableDraft,
    handleUndoTaskTableDraft,
    recordTaskTableDraftPatches,
    resetTaskTableDraftPatches,
    setTaskTableEditing,
    taskTableDraftDeletedIds,
    taskTableDraftDirtyCellMap,
    taskTableDraftDirtyRowIds,
    taskTableDraftPatches,
    taskTableDraftRows,
    taskTableEditing,
  }
}
