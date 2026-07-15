import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'

import { toast } from '@/hooks/use-toast'
import { isAbortError } from '@/lib/apiClient'
import { DataQualityApiService, type DataQualityLiveCheckSummary } from '@/services/dataQualityApi'
import { getTaskScopePatchFromSelection } from '@/hooks/usePlanningScope'

import type { Task, TaskCondition } from '../GanttViewTypes'
import {
  type TaskTableDraftPatch,
  type TaskTableDraftPatches,
} from './taskDraftUtils'
import {
  buildGanttLiveCheckDraft,
  buildGanttTaskDataFromFormData,
  buildGanttTaskFormDataFromTask,
  createEmptyGanttTaskFormData,
  validateGanttTaskFormData,
  type GanttTaskFormData,
  type GanttTaskFormErrors,
} from './taskFormUtils'

type UseGanttTaskDialogActionsInput = {
  canEdit: boolean
  dialogOpen: boolean
  editingProgressReadOnlyReason?: string | null
  editingTask: Task | null
  formData: GanttTaskFormData
  projectId?: string | null
  scopeSelection: Parameters<typeof getTaskScopePatchFromSelection>[0]
  taskSaving: boolean
  taskTableDraftRows: Task[]
  tasks: Task[]
  unmetEditingTaskConditions: TaskCondition[]
  enqueueTaskTableDraftPatch: (taskId: string, patch: Partial<Task>) => void
  openConditionWarning: (task: Pick<Task, 'title'> & { id?: string }, pendingConditionCount: number) => void
  recordTaskTableDraftPatches: (updater: (current: TaskTableDraftPatches) => TaskTableDraftPatches) => void
  setConflictData: Dispatch<SetStateAction<{ localVersion: Task; serverVersion: Task } | null>>
  setConflictOpen: (open: boolean) => void
  setDialogOpen: (open: boolean) => void
  setEditingTask: (task: Task | null) => void
  setFormData: Dispatch<SetStateAction<GanttTaskFormData>>
  setLiveCheckLoading: (loading: boolean) => void
  setLiveCheckSummary: Dispatch<SetStateAction<DataQualityLiveCheckSummary | null>>
  setNewTaskConditionPromptId: (taskId: string | null) => void
  setNewTaskParentId: (taskId: string | null) => void
  setPendingTaskData: Dispatch<SetStateAction<Partial<Task> | null>>
  setSelectedIds: (selectedIds: Set<string>) => void
  setTaskFormErrors: Dispatch<SetStateAction<GanttTaskFormErrors>>
  setTaskSaving: (saving: boolean) => void
  setTaskTableEditing: (editing: boolean) => void
  updateTask: (taskId: string, patch: Partial<Task>) => void
  conflictData: {
    localVersion: Task
    serverVersion: Task
  } | null
  pendingTaskData: Partial<Task> | null
}

type TaskManualScopePatch = Pick<
  GanttTaskFormData,
  'building_object_id'
  | 'basement_object_id'
  | 'floor_object_id'
  | 'physical_zone_object_id'
  | 'functional_area_object_id'
>

function readTaskManualScopePatch(task: Partial<Task> | GanttTaskFormData): TaskManualScopePatch {
  return {
    building_object_id: task.building_object_id ?? null,
    basement_object_id: task.basement_object_id ?? null,
    floor_object_id: task.floor_object_id ?? null,
    physical_zone_object_id: task.physical_zone_object_id ?? null,
    functional_area_object_id: task.functional_area_object_id ?? null,
  }
}

export function useGanttTaskDialogActions({
  canEdit,
  conflictData,
  dialogOpen,
  editingProgressReadOnlyReason,
  editingTask,
  formData,
  pendingTaskData,
  projectId,
  scopeSelection,
  taskSaving,
  taskTableDraftRows,
  tasks,
  unmetEditingTaskConditions,
  enqueueTaskTableDraftPatch,
  openConditionWarning,
  recordTaskTableDraftPatches,
  setConflictData,
  setConflictOpen,
  setDialogOpen,
  setEditingTask,
  setFormData,
  setLiveCheckLoading,
  setLiveCheckSummary,
  setNewTaskConditionPromptId,
  setNewTaskParentId,
  setPendingTaskData,
  setSelectedIds,
  setTaskFormErrors,
  setTaskSaving,
  setTaskTableEditing,
  updateTask,
}: UseGanttTaskDialogActionsInput) {
  const lastManualTaskScopeRef = useRef<TaskManualScopePatch>({
    building_object_id: null,
    basement_object_id: null,
    floor_object_id: null,
    physical_zone_object_id: null,
    functional_area_object_id: null,
  })
  const buildLiveCheckDraft = useCallback(
    () => buildGanttLiveCheckDraft(formData, editingTask),
    [editingTask, formData],
  )

  const resetForm = useCallback(() => {
    setEditingTask(null)
    setLiveCheckSummary(null)
    setLiveCheckLoading(false)
    setTaskFormErrors({})
    setFormData(createEmptyGanttTaskFormData())
    setNewTaskParentId(null)
  }, [
    setEditingTask,
    setFormData,
    setLiveCheckLoading,
    setLiveCheckSummary,
    setNewTaskParentId,
    setTaskFormErrors,
  ])

  useEffect(() => {
    if (!dialogOpen || !projectId) {
      setLiveCheckSummary(null)
      setLiveCheckLoading(false)
      return
    }

    const hasDraftContent = Boolean(
      editingTask
      || formData.name.trim()
      || formData.description.trim()
      || formData.start_date
      || formData.end_date
      || formData.progress > 0
      || formData.dependencies.length > 0
      || formData.parent_id
      || formData.milestone_id
      || formData.assignee_name.trim()
      || formData.participant_unit_id,
    )

    if (!hasDraftContent) {
      setLiveCheckSummary(null)
      setLiveCheckLoading(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLiveCheckLoading(true)
      void DataQualityApiService.liveCheckTaskDraft(
        projectId,
        buildLiveCheckDraft(),
        editingTask?.id,
        { signal: controller.signal },
      )
        .then((summary) => {
          if (!controller.signal.aborted) {
            setLiveCheckSummary(summary)
          }
        })
        .catch((error) => {
          if (!isAbortError(error)) {
            console.warn('[GanttView] live data-quality check failed', error)
            setLiveCheckSummary(null)
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLiveCheckLoading(false)
          }
        })
    }, 240)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [
    buildLiveCheckDraft,
    dialogOpen,
    editingTask,
    formData.assignee_name,
    formData.dependencies,
    formData.description,
    formData.end_date,
    formData.milestone_id,
    formData.name,
    formData.parent_id,
    formData.participant_unit_id,
    formData.progress,
    formData.start_date,
    projectId,
    setLiveCheckLoading,
    setLiveCheckSummary,
  ])

  const handleSaveTask = useCallback(async () => {
    if (taskSaving || !canEdit) return

    const nextErrors = validateGanttTaskFormData(formData)
    setTaskFormErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0 || !projectId) {
      if (Object.keys(nextErrors).length > 0) {
        toast({ title: '请先补全任务日期、名称与主要施工范围', variant: 'destructive' })
      }
      return
    }

    if (formData.dependencies && formData.dependencies.length > 0) {
      const newStartDate = formData.start_date ? new Date(formData.start_date) : null

      for (const depId of formData.dependencies) {
        const depTask = tasks.find((task) => task.id === depId)
        if (!depTask) continue

        const depStartDate = depTask.start_date ? new Date(depTask.start_date) : null
        const depEndDate = depTask.end_date ? new Date(depTask.end_date) : null

        if (newStartDate && depEndDate && newStartDate < depEndDate) {
          toast({
            title: '日期冲突',
            description: `依赖任务 "${depTask.title}" 完成于 ${depTask.end_date}，当前任务开始时间不能早于此时间`,
            variant: 'destructive',
          })
          return
        }

        if (newStartDate && depStartDate && newStartDate < depStartDate) {
          toast({
            title: '依赖提醒',
            description: `依赖任务 "${depTask.title}" 开始于 ${depTask.start_date}，建议当前任务安排在其之后`,
          })
        }
      }
    }

    try {
      setTaskSaving(true)

      const preSaveSummary = await DataQualityApiService.liveCheckTaskDraft(
        projectId,
        buildLiveCheckDraft(),
        editingTask?.id,
      ).catch((error) => {
        console.warn('[GanttView] pre-save live data-quality check failed', error)
        return null
      })

      if (preSaveSummary) {
        setLiveCheckSummary(preSaveSummary)
      }

      const canWriteProgress = !editingTask || !editingProgressReadOnlyReason
      let autoStatus = formData.status
      if (canWriteProgress) {
        if (formData.progress >= 100 && formData.status !== 'completed') {
          autoStatus = 'completed'
        } else if (formData.progress === 0 && formData.status === 'completed') {
          autoStatus = 'todo'
        }
      }

      const taskData = buildGanttTaskDataFromFormData(formData, {
        autoStatus,
        includeProgress: canWriteProgress,
        projectId,
      })

      const predecessorTaskIds = formData.dependencies || []
      const taskValues = { ...taskData }
      delete taskValues.dependencies

      if (editingTask) {
        const shouldWarnConditionAdvance = canWriteProgress
          && Number(editingTask.progress ?? 0) === 0
          && Number(formData.progress ?? 0) > 0
          && unmetEditingTaskConditions.length > 0
        enqueueTaskTableDraftPatch(editingTask.id, {
          ...taskValues,
          dependencies: predecessorTaskIds,
        } as Partial<Task>)
        if (shouldWarnConditionAdvance) {
          openConditionWarning(editingTask, unmetEditingTaskConditions.length)
        }
        toast({
          title: preSaveSummary?.count
            ? `任务编辑已暂存，另有 ${preSaveSummary.count} 条数据矛盾待确认`
            : '任务编辑已暂存',
          description: preSaveSummary?.count ? `${preSaveSummary.summary} 保存编辑后生效。` : '保存编辑后生效。',
        })
      } else {
        const clientRowId = `new-task-${Date.now()}`
        const parentId = formData.parent_id || null
        lastManualTaskScopeRef.current = readTaskManualScopePatch(formData)
        const sortOrder = taskTableDraftRows
          .filter((task) => (task.parent_id ?? null) === parentId)
          .reduce((max, task) => Math.max(max, Number(task.sort_order ?? -1)), -1) + 1
        recordTaskTableDraftPatches((current) => ({
          ...current,
          [clientRowId]: {
            __draftCreated: true,
            ...taskValues,
            id: clientRowId,
            project_id: projectId,
            parent_id: parentId,
            sort_order: sortOrder,
            dependencies: predecessorTaskIds,
          } as TaskTableDraftPatch,
        }))
        setTaskTableEditing(true)
        setSelectedIds(new Set([clientRowId]))
        toast({
          title: preSaveSummary?.count
            ? `任务草稿已新增，另有 ${preSaveSummary.count} 条数据矛盾待确认`
            : '任务草稿已新增',
          description: preSaveSummary?.count ? `${preSaveSummary.summary} 保存编辑后写入任务列表。` : '保存编辑后写入任务列表。',
        })
        setNewTaskConditionPromptId(clientRowId)
      }

      setDialogOpen(false)
      resetForm()
    } catch (error) {
      console.error('保存任务失败:', error)
      toast({ title: '保存失败: ' + (error as Error).message, variant: 'destructive' })
    } finally {
      setTaskSaving(false)
    }
  }, [
    buildLiveCheckDraft,
    canEdit,
    editingProgressReadOnlyReason,
    editingTask,
    enqueueTaskTableDraftPatch,
    formData,
    openConditionWarning,
    projectId,
    recordTaskTableDraftPatches,
    resetForm,
    setDialogOpen,
    setLiveCheckSummary,
    setNewTaskConditionPromptId,
    setSelectedIds,
    setTaskFormErrors,
    setTaskSaving,
    setTaskTableEditing,
    taskSaving,
    taskTableDraftRows,
    tasks,
    unmetEditingTaskConditions,
  ])

  const openEditDialog = useCallback((task?: Task, parentId?: string) => {
    if (!canEdit) return
    if (task) {
      setEditingTask(task)
      setTaskFormErrors({})
      lastManualTaskScopeRef.current = readTaskManualScopePatch(task)
      setFormData(buildGanttTaskFormDataFromTask(task))
    } else {
      const inheritedScopePatch = getTaskScopePatchFromSelection(scopeSelection)
      resetForm()
      setFormData((prev) => ({
        ...prev,
        ...lastManualTaskScopeRef.current,
        ...inheritedScopePatch,
        parent_id: parentId || null,
      }))
    }
    setNewTaskParentId(parentId || null)
    setDialogOpen(true)
  }, [
    canEdit,
    resetForm,
    scopeSelection,
    setDialogOpen,
    setEditingTask,
    setFormData,
    setNewTaskParentId,
    setTaskFormErrors,
  ])

  const handleDependencyChange = useCallback((taskId: string, checked: boolean) => {
    setFormData((current) => {
      const currentDeps = current.dependencies || []
      if (checked) {
        if (taskId !== editingTask?.id) {
          return { ...current, dependencies: [...currentDeps, taskId] }
        }
        return current
      }
      return { ...current, dependencies: currentDeps.filter((id) => id !== taskId) }
    })
  }, [editingTask?.id, setFormData])

  const handleKeepLocal = useCallback(async () => {
    if (!conflictData || !pendingTaskData || !editingTask) return

    const predecessorTaskIds = Array.isArray(pendingTaskData.dependencies)
      ? pendingTaskData.dependencies.map((value) => String(value)).filter(Boolean)
      : formData.dependencies || []
    enqueueTaskTableDraftPatch(editingTask.id, {
      ...pendingTaskData,
      dependencies: predecessorTaskIds,
    } as Partial<Task>)
    toast({ title: '已保留你的修改', description: '保存编辑后生效。' })
    setConflictOpen(false)
    setConflictData(null)
    setPendingTaskData(null)
  }, [
    conflictData,
    editingTask,
    enqueueTaskTableDraftPatch,
    formData.dependencies,
    pendingTaskData,
    setConflictData,
    setConflictOpen,
    setPendingTaskData,
  ])

  const handleKeepServer = useCallback(() => {
    if (!conflictData || !editingTask) return

    updateTask(editingTask.id, conflictData.serverVersion)
    toast({ title: '已使用服务器版本' })

    setConflictOpen(false)
    setConflictData(null)
    setPendingTaskData(null)
    setDialogOpen(false)
    resetForm()
  }, [
    conflictData,
    editingTask,
    resetForm,
    setConflictData,
    setConflictOpen,
    setDialogOpen,
    setPendingTaskData,
    updateTask,
  ])

  const handleMerge = useCallback(() => {
    setConflictOpen(false)
    toast({
      title: '请手动合并差异',
      description: '服务器版本已经加载到表单。',
    })
  }, [setConflictOpen])

  return {
    handleDependencyChange,
    handleKeepLocal,
    handleKeepServer,
    handleMerge,
    handleSaveTask,
    openEditDialog,
    resetForm,
  }
}
