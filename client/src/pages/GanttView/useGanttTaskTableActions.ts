import { useCallback } from 'react'

import type { PlanningTreeCellUpdate, PlanningTreeClipboardRow } from '@/components/planning/PlanningTreeView'
import type { ScopeBarSelection } from '@/components/planning/PlanningScopeBar'
import { toast } from '@/hooks/use-toast'
import { getTaskScopePatchFromSelection } from '@/hooks/usePlanningScope'
import { getApiErrorMessage } from '@/lib/apiClient'
import type { EngineeringObject } from '@/services/engineeringObjectsApi'
import type { DragEndEvent } from '@dnd-kit/core'

import type { ParticipantUnitRecord } from './ParticipantUnitsDialog'
import type { Task, WBSNode } from '../GanttViewTypes'
import { getTaskProgressReadOnlyReason } from '../GanttViewTypes'
import { normalizeTaskEditableStatus } from './ganttViewUtils'
import {
  buildBatchCompleteDraftPatches,
  buildBatchTaskDraftPatches,
  buildDragSortDraftPatches,
  buildFirstTaskDraftPatch,
  buildTaskRowDeletionPlan,
  cloneTaskTableDraftPatches,
  type BatchTaskUpdatePayload,
  type TaskTableDraftPatches,
} from './taskDraftUtils'
import {
  buildPastedTaskDraftPatches,
  buildTaskCellDraftPatch,
  buildTaskFillDraftPatch,
  normalizeClipboardProgressValue,
  removeReadOnlyProgressDraftPatch,
} from './taskClipboardUtils'
import { parseTaskImportFile } from './taskImportUtils'

type TaskConditionSummaryLike = {
  total?: number | string | null
  satisfied?: number | string | null
}

type UseGanttTaskTableActionsInput = {
  batchUpdating: boolean
  blockedProgressTaskIds: Set<string>
  canEdit: boolean
  engineeringObjects: EngineeringObject[]
  enqueueTaskTableDraftPatch: (taskId: string, patch: Partial<Task>) => void
  flatList: WBSNode[]
  inlineTitleValue: string
  participantUnits: ParticipantUnitRecord[]
  projectId?: string | null
  recordTaskTableDraftPatches: (updater: (current: TaskTableDraftPatches) => TaskTableDraftPatches) => void
  scopeSelection: ScopeBarSelection
  selectedIds: Set<string>
  setBatchUpdating: (next: boolean) => void
  setInlineTitleTaskId: (taskId: string | null) => void
  setInlineTitleValue: (title: string) => void
  setSelectedIds: (next: Set<string> | ((current: Set<string>) => Set<string>)) => void
  setTaskTableEditing: (next: boolean) => void
  taskConditionSummaryByTaskId: Record<string, TaskConditionSummaryLike | undefined>
  taskTableDraftPatches: TaskTableDraftPatches
  taskTableDraftRows: Task[]
  taskTableEditing: boolean
  tasks: Task[]
  openConditionWarning: (task: Task, pendingConditionCount: number) => void
}

export function useGanttTaskTableActions({
  batchUpdating,
  blockedProgressTaskIds,
  canEdit,
  engineeringObjects,
  enqueueTaskTableDraftPatch,
  flatList,
  inlineTitleValue,
  participantUnits,
  projectId,
  recordTaskTableDraftPatches,
  scopeSelection,
  selectedIds,
  setBatchUpdating,
  setInlineTitleTaskId,
  setInlineTitleValue,
  setSelectedIds,
  setTaskTableEditing,
  taskConditionSummaryByTaskId,
  taskTableDraftPatches,
  taskTableDraftRows,
  taskTableEditing,
  tasks,
  openConditionWarning,
}: UseGanttTaskTableActionsInput) {
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (!canEdit || !taskTableEditing) {
      toast({ title: '请先点击编辑表格', description: '拖拽排序会先进入编辑缓冲，保存编辑后生效。' })
      return
    }
    const { active, over } = event
    if (!over || active.id === over.id) return

    const result = buildDragSortDraftPatches({
      current: taskTableDraftPatches,
      flatList,
      taskTableDraftRows,
      activeId: String(active.id),
      overId: String(over.id),
    })
    if (!result) return
    if (result.blocked) {
      toast({ title: '无法移动', description: '不能将任务移动到其子任务下。', variant: 'destructive' })
      return
    }

    recordTaskTableDraftPatches(() => result.nextPatches)
    toast({
      title: result.isCrossLevel ? '已暂存层级调整' : '已暂存排序调整',
      description: '保存编辑后生效，保存前可撤销或取消。',
    })
  }, [canEdit, flatList, recordTaskTableDraftPatches, taskTableDraftPatches, taskTableDraftRows, taskTableEditing])

  const handleInlineProgressSave = useCallback(async (taskId: string, newProgress: number) => {
    if (!canEdit) return
    const task = tasks.find((item) => item.id === taskId)
    if (!task) return
    const progressReadOnlyReason = getTaskProgressReadOnlyReason(task.progress_method)
    if (progressReadOnlyReason) {
      toast({ title: progressReadOnlyReason })
      return
    }
    if (blockedProgressTaskIds.has(taskId)) {
      toast({ title: '开工条件未满足，请先处理条件后再填报进度。', variant: 'destructive' })
      return
    }

    const prevProgress = task.progress ?? 0
    const taskConditionSummary = taskConditionSummaryByTaskId[taskId]
    const pendingConditionCount = Math.max(0, Number(taskConditionSummary?.total ?? 0) - Number(taskConditionSummary?.satisfied ?? 0))
    const shouldWarnConditionAdvance = prevProgress === 0 && newProgress > 0 && pendingConditionCount > 0
    const currentStatus = normalizeTaskEditableStatus(task.status)
    const autoStatus = (newProgress >= 100
      ? 'completed'
      : newProgress > 0 && currentStatus === 'todo'
      ? 'in_progress'
      : newProgress === 0 && currentStatus === 'completed'
      ? 'todo'
      : currentStatus) as 'todo' | 'in_progress' | 'completed'

    enqueueTaskTableDraftPatch(taskId, {
      progress: newProgress,
      status: autoStatus,
    } as Partial<Task>)
    toast({ title: '进度已加入表格编辑', description: '保存编辑后生效。' })
    if (shouldWarnConditionAdvance) {
      openConditionWarning(task, pendingConditionCount)
    }
  }, [blockedProgressTaskIds, canEdit, enqueueTaskTableDraftPatch, openConditionWarning, taskConditionSummaryByTaskId, tasks])

  const handleProgressEntrySave = useCallback(async (taskId: string, newProgress: number) => {
    await handleInlineProgressSave(taskId, newProgress)
  }, [handleInlineProgressSave])

  const handleTaskTableProgressDraftSave = useCallback((taskId: string, newProgress: number) => {
    if (!canEdit || !taskTableEditing) return
    const progress = normalizeClipboardProgressValue(newProgress)
    enqueueTaskTableDraftPatch(taskId, {
      progress,
      status: progress >= 100 ? 'completed' : progress > 0 ? 'in_progress' : 'todo',
    } as Partial<Task>)
  }, [canEdit, enqueueTaskTableDraftPatch, taskTableEditing])

  const handleStatusChange = useCallback(async (taskId: string, val: string) => {
    if (!canEdit) return
    if (!taskTableEditing) {
      toast({ title: '请先点击编辑表格', description: '状态修改会先进入编辑缓冲，保存编辑后生效。' })
      return
    }
    const task = tasks.find((item) => item.id === taskId)
    const progressReadOnlyReason = getTaskProgressReadOnlyReason(task?.progress_method)
    const normalizedStatus = normalizeTaskEditableStatus(val)
    const statusPayload: Record<string, unknown> = {
      status: normalizedStatus,
    }
    if (normalizedStatus === 'completed' && !progressReadOnlyReason) {
      statusPayload.progress = 100
    }

    enqueueTaskTableDraftPatch(taskId, statusPayload as Partial<Task>)
    toast({ title: '状态已加入表格编辑', description: '保存编辑后生效。' })
  }, [canEdit, enqueueTaskTableDraftPatch, taskTableEditing, tasks])

  const handleInlineTaskPatchSave = useCallback(async (taskId: string, patch: Record<string, unknown>) => {
    if (!canEdit) return
    enqueueTaskTableDraftPatch(taskId, patch as Partial<Task>)
    toast({ title: taskTableEditing ? '任务已加入表格编辑' : '已进入表格编辑', description: '保存编辑后生效。' })
  }, [canEdit, enqueueTaskTableDraftPatch, taskTableEditing])

  const handlePasteTaskRows = useCallback(async (clipboardRows: PlanningTreeClipboardRow[], anchorRowId?: string | null) => {
    if (!canEdit || !taskTableEditing || !projectId || clipboardRows.length === 0) return

    const { createdIds, createdDraftPatches, skippedUnitCount, skippedScopeCount } = buildPastedTaskDraftPatches({
      clipboardRows,
      anchorRowId,
      flatList,
      taskTableDraftRows,
      projectId,
      participantUnits,
      engineeringObjects,
      fallbackScopePatch: getTaskScopePatchFromSelection(scopeSelection),
    })

    recordTaskTableDraftPatches((current) => ({ ...current, ...createdDraftPatches }))
    setSelectedIds(new Set(createdIds))
    toast({
      title: `已粘贴 ${createdIds.length} 个任务草稿`,
      description: [
        '保存编辑后写入任务列表。',
        skippedUnitCount > 0 ? `已跳过 ${skippedUnitCount} 个未匹配责任单位。` : null,
        skippedScopeCount > 0 ? `已跳过 ${skippedScopeCount} 个未匹配工程对象。` : null,
      ].filter(Boolean).join(' ') || undefined,
    })
  }, [canEdit, engineeringObjects, flatList, participantUnits, projectId, recordTaskTableDraftPatches, scopeSelection, setSelectedIds, taskTableDraftRows, taskTableEditing])

  const handleImportTaskFile = useCallback(async (file: File) => {
    if (!canEdit || !projectId) return

    try {
      const clipboardRows = await parseTaskImportFile(file)
      if (clipboardRows.length === 0) {
        toast({ title: '未识别到可导入的任务行', description: '请确认文件包含任务名称列。', variant: 'destructive' })
        return
      }

      const { createdIds, createdDraftPatches, skippedUnitCount, skippedScopeCount } = buildPastedTaskDraftPatches({
        clipboardRows,
        anchorRowId: null,
        flatList,
        taskTableDraftRows,
        projectId,
        participantUnits,
        engineeringObjects,
        fallbackScopePatch: getTaskScopePatchFromSelection(scopeSelection),
      })

      setTaskTableEditing(true)
      recordTaskTableDraftPatches((current) => ({ ...current, ...createdDraftPatches }))
      setSelectedIds(new Set(createdIds))
      toast({
        title: `已导入 ${createdIds.length} 行任务草稿`,
        description: [
          '保存编辑后写入任务列表。',
          skippedUnitCount > 0 ? `已跳过 ${skippedUnitCount} 个未匹配责任单位。` : null,
          skippedScopeCount > 0 ? `已跳过 ${skippedScopeCount} 个未匹配工程对象。` : null,
        ].filter(Boolean).join(' ') || undefined,
      })
    } catch (error) {
      toast({
        title: '导入计划文件失败',
        description: getApiErrorMessage(error, '请确认文件格式为 xlsx、xls、csv 或 tsv。'),
        variant: 'destructive',
      })
    }
  }, [canEdit, engineeringObjects, flatList, participantUnits, projectId, recordTaskTableDraftPatches, scopeSelection, setSelectedIds, setTaskTableEditing, taskTableDraftRows])

  const handleAddFirstTaskRow = useCallback(() => {
    if (!canEdit || !projectId) return

    const { clientRowId, title, patch } = buildFirstTaskDraftPatch({
      scopePatch: getTaskScopePatchFromSelection(scopeSelection),
      taskTableDraftRows,
    })

    setTaskTableEditing(true)
    recordTaskTableDraftPatches((current) => ({
      ...current,
      [clientRowId]: patch,
    }))
    setSelectedIds(new Set([clientRowId]))
    setInlineTitleTaskId(clientRowId)
    setInlineTitleValue(title)
    toast({ title: '已新增首行草稿', description: '保存编辑后写入任务列表。' })
  }, [canEdit, projectId, recordTaskTableDraftPatches, scopeSelection, setInlineTitleTaskId, setInlineTitleValue, setSelectedIds, setTaskTableEditing, taskTableDraftRows])

  const handleDeleteTaskRows = useCallback((rowIds: string[]) => {
    if (!canEdit || !taskTableEditing || rowIds.length === 0) return

    const { idsToDelete, orderedNodes } = buildTaskRowDeletionPlan({
      rowIds,
      taskTableDraftRows,
      flatList,
    })
    if (orderedNodes.length === 0) return

    recordTaskTableDraftPatches((current) => {
      const next = cloneTaskTableDraftPatches(current)
      orderedNodes.forEach((node) => {
        next[node.id] = { __draftDeleted: true }
      })
      return next
    })
    setSelectedIds((current) => new Set([...current].filter((taskId) => !idsToDelete.has(taskId))))
    toast({
      title: `已暂存删除 ${orderedNodes.length} 个任务`,
      description: '保存编辑前可撤销或取消。',
    })
  }, [canEdit, flatList, recordTaskTableDraftPatches, setSelectedIds, taskTableDraftRows, taskTableEditing])

  const handleFillTaskRows = useCallback((rowIds: string[], row: PlanningTreeClipboardRow) => {
    if (!canEdit || !taskTableEditing || rowIds.length === 0) return
    const { patch, skippedUnitCount, skippedScopeCount } = buildTaskFillDraftPatch(row, {
      participantUnits,
      engineeringObjects,
      rowCount: rowIds.length,
    })

    if (Object.keys(patch).length === 0) return
    let skippedProgressCount = 0
    rowIds.forEach((taskId) => {
      const task = tasks.find((item) => item.id === taskId)
      const { patch: nextPatch, skippedProgress } = removeReadOnlyProgressDraftPatch(patch, task)
      if (skippedProgress) skippedProgressCount += 1
      if (Object.keys(nextPatch).length === 0) return
      enqueueTaskTableDraftPatch(taskId, nextPatch as Partial<Task>)
    })
    toast({
      title: skippedProgressCount > 0
        ? `已加入 ${rowIds.length} 行表格草稿，已跳过 ${skippedProgressCount} 个自动进度字段`
        : `已加入 ${rowIds.length} 行表格草稿`,
      description: [
        skippedUnitCount > 0 ? `已跳过 ${skippedUnitCount} 个未匹配责任单位，请先在责任单位主数据中维护。` : null,
        skippedScopeCount > 0 ? `已跳过 ${skippedScopeCount} 个未匹配工程对象，请先在工程对象主数据中维护。` : null,
      ].filter(Boolean).join(' ') || undefined,
    })
  }, [canEdit, engineeringObjects, enqueueTaskTableDraftPatch, participantUnits, taskTableEditing, tasks])

  const handleUpdateTaskCells = useCallback((updates: PlanningTreeCellUpdate[]) => {
    if (!canEdit || !taskTableEditing || updates.length === 0) return
    const updatesByRow = updates.reduce((map, update) => {
      const list = map.get(update.rowId) ?? []
      list.push(update)
      map.set(update.rowId, list)
      return map
    }, new Map<string, PlanningTreeCellUpdate[]>())

    let skippedProgressCount = 0
    let skippedUnitCount = 0
    let skippedScopeCount = 0
    let updatedRowCount = 0
    Array.from(updatesByRow.entries()).forEach(([taskId, rowUpdates]) => {
      const task = tasks.find((item) => item.id === taskId)
      const result = buildTaskCellDraftPatch(rowUpdates, task, {
        participantUnits,
        engineeringObjects,
      })
      const { patch } = result
      skippedProgressCount += result.skippedProgressCount
      skippedUnitCount += result.skippedUnitCount
      skippedScopeCount += result.skippedScopeCount
      if (Object.keys(patch).length === 0) return
      updatedRowCount += 1
      enqueueTaskTableDraftPatch(taskId, patch as Partial<Task>)
    })

    toast({
      title: skippedProgressCount > 0
        ? `已加入 ${updatedRowCount} 行表格草稿，已跳过 ${skippedProgressCount} 个自动进度单元格`
        : `已加入 ${updatedRowCount} 行表格草稿`,
      description: [
        skippedUnitCount > 0 ? `已跳过 ${skippedUnitCount} 个未匹配责任单位，请先在责任单位主数据中维护。` : null,
        skippedScopeCount > 0 ? `已跳过 ${skippedScopeCount} 个未匹配工程对象，请先在工程对象主数据中维护。` : null,
      ].filter(Boolean).join(' ') || undefined,
    })
  }, [canEdit, engineeringObjects, enqueueTaskTableDraftPatch, participantUnits, taskTableEditing, tasks])

  const handleInlineTitleSave = useCallback(async (taskId: string) => {
    if (!canEdit) return
    const trimmed = inlineTitleValue.trim()
    if (!trimmed) {
      setInlineTitleTaskId(null)
      return
    }
    const task = taskTableDraftRows.find((item) => item.id === taskId)
    if (!task || trimmed === task.title) {
      setInlineTitleTaskId(null)
      return
    }
    if (taskTableEditing) {
      enqueueTaskTableDraftPatch(taskId, { title: trimmed } as Partial<Task>)
      setInlineTitleTaskId(null)
      return
    }
    enqueueTaskTableDraftPatch(taskId, { title: trimmed } as Partial<Task>)
    toast({ title: '已进入表格编辑', description: '任务名称保存编辑后生效。' })
    setInlineTitleTaskId(null)
  }, [canEdit, enqueueTaskTableDraftPatch, inlineTitleValue, setInlineTitleTaskId, taskTableDraftRows, taskTableEditing])

  const handleBatchComplete = useCallback(async () => {
    if (selectedIds.size === 0 || !canEdit || !taskTableEditing) return
    let alreadyDone = 0
    let changedCount = 0
    recordTaskTableDraftPatches((current) => {
      const result = buildBatchCompleteDraftPatches({
        current,
        selectedIds,
        tasks,
      })
      alreadyDone = result.alreadyDone
      changedCount = result.changedCount
      return result.nextPatches
    })

    setSelectedIds(new Set())
    toast({
      title: `已暂存完成 ${changedCount} 个任务`,
      description: alreadyDone > 0
        ? `其中 ${alreadyDone} 个任务原本已是完成状态。保存编辑后生效。`
        : '保存编辑后生效。',
    })
  }, [canEdit, recordTaskTableDraftPatches, selectedIds, setSelectedIds, taskTableEditing, tasks])

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0 || !canEdit || !taskTableEditing) return
    handleDeleteTaskRows(Array.from(selectedIds))
  }, [canEdit, handleDeleteTaskRows, selectedIds, taskTableEditing])

  const handleApplyBatchUpdate = useCallback(async (payload: BatchTaskUpdatePayload) => {
    if (!projectId || selectedIds.size === 0 || !canEdit || batchUpdating || !taskTableEditing) return

    setBatchUpdating(true)
    try {
      let changedCount = 0
      let skippedProgressCount = 0

      recordTaskTableDraftPatches((current) => {
        const result = buildBatchTaskDraftPatches({
          current,
          selectedIds,
          tasks,
          payload,
        })
        changedCount = result.changedCount
        skippedProgressCount = result.skippedProgressCount
        return result.nextPatches
      })

      toast({
        title: '批量更新已加入表格编辑',
        description: [
          `已暂存 ${changedCount} 个任务，请点击保存编辑后生效。`,
          skippedProgressCount > 0 ? `已跳过 ${skippedProgressCount} 个只读进度字段。` : null,
        ].filter(Boolean).join(' '),
      })
      setSelectedIds(new Set())
    } catch (error) {
      toast({
        title: '批量更新失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setBatchUpdating(false)
    }
  }, [batchUpdating, canEdit, projectId, recordTaskTableDraftPatches, selectedIds, setBatchUpdating, setSelectedIds, taskTableEditing, tasks])

  return {
    handleAddFirstTaskRow,
    handleApplyBatchUpdate,
    handleBatchComplete,
    handleBatchDelete,
    handleDeleteTaskRows,
    handleFillTaskRows,
    handleInlineProgressSave,
    handleInlineTaskPatchSave,
    handleInlineTitleSave,
    handleImportTaskFile,
    handlePasteTaskRows,
    handleProgressEntrySave,
    handleStatusChange,
    handleTaskTableProgressDraftSave,
    handleUpdateTaskCells,
  }
}
