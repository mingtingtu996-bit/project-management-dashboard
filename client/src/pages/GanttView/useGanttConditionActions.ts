import { useCallback, useEffect, type Dispatch, type MouseEvent, type SetStateAction } from 'react'

import type { NewConditionFormValue } from '@/components/planning/conditions/NewConditionForm'
import { toast } from '@/hooks/use-toast'

import type { ParticipantUnitRecord } from './ParticipantUnitsDialog'
import type { Task, TaskCondition } from '../GanttViewTypes'
import { getTaskConditionsForTask, toStoreConditionRecords } from './ganttViewUtils'
import {
  createTaskCondition,
  deleteTaskConditionRecord,
  fetchTaskConditionPrecedingTaskMap,
  type TaskConditionPrecedingTask,
  updateTaskCondition,
} from './taskConditionApi'

type SetProjectConditions = (conditions: ReturnType<typeof toStoreConditionRecords>) => void

type UseGanttConditionActionsInput = {
  canEdit: boolean
  conditionTask: Task | null
  confirmCondition: TaskCondition | null
  confirmConditionReason: string
  expandedConditionTaskId: string | null
  inlineConditionsMap: Record<string, TaskCondition[]>
  newConditionDescription: string
  newConditionName: string
  newConditionPrecedingTaskIds: string[]
  newConditionResponsibleUnit: string
  newConditionTargetDate: string
  newConditionType: string
  openConfirm: (title: string, message: string, onConfirm: () => void) => void
  participantUnits: ParticipantUnitRecord[]
  projectConditions: TaskCondition[]
  setConditionDialogOpen: (open: boolean) => void
  setConditionPrecedingTasks: Dispatch<SetStateAction<Record<string, TaskConditionPrecedingTask[]>>>
  setConditionTask: (task: Task | null) => void
  setConditionsLoading: (loading: boolean) => void
  setConfirmCondition: (condition: TaskCondition | null) => void
  setConfirmConditionDialogOpen: (open: boolean) => void
  setConfirmConditionReason: (reason: string) => void
  setExpandedConditionTaskId: (taskId: string | null) => void
  setInlineConditionsMap: Dispatch<SetStateAction<Record<string, TaskCondition[]>>>
  setNewConditionDescription: (description: string) => void
  setNewConditionName: (name: string) => void
  setNewConditionPrecedingTaskIds: (taskIds: string[]) => void
  setNewConditionResponsibleUnit: (unitId: string) => void
  setNewConditionTargetDate: (targetDate: string) => void
  setNewConditionType: (type: string) => void
  setProjectConditions: SetProjectConditions
  setTaskConditions: Dispatch<SetStateAction<TaskCondition[]>>
  taskConditions: TaskCondition[]
}

export function useGanttConditionActions({
  canEdit,
  conditionTask,
  confirmCondition,
  confirmConditionReason,
  expandedConditionTaskId,
  inlineConditionsMap,
  newConditionDescription,
  newConditionName,
  newConditionPrecedingTaskIds,
  newConditionResponsibleUnit,
  newConditionTargetDate,
  newConditionType,
  openConfirm,
  participantUnits,
  projectConditions,
  setConditionDialogOpen,
  setConditionPrecedingTasks,
  setConditionTask,
  setConditionsLoading,
  setConfirmCondition,
  setConfirmConditionDialogOpen,
  setConfirmConditionReason,
  setExpandedConditionTaskId,
  setInlineConditionsMap,
  setNewConditionDescription,
  setNewConditionName,
  setNewConditionPrecedingTaskIds,
  setNewConditionResponsibleUnit,
  setNewConditionTargetDate,
  setNewConditionType,
  setProjectConditions,
  setTaskConditions,
  taskConditions,
}: UseGanttConditionActionsInput) {
  useEffect(() => {
    if (!conditionTask) return

    setTaskConditions(getTaskConditionsForTask(conditionTask.id, projectConditions))
  }, [conditionTask, projectConditions, setTaskConditions])

  const replaceConditionInState = useCallback((conditionId: string, nextCondition: TaskCondition) => {
    setProjectConditions(
      toStoreConditionRecords(projectConditions.map((item) => (item.id === conditionId ? { ...item, ...nextCondition } : item))),
    )
    setTaskConditions((prev) => prev.map((item) => (item.id === conditionId ? nextCondition : item)))
    setInlineConditionsMap((prev) => {
      if (!nextCondition.task_id || !prev[nextCondition.task_id]) return prev
      return {
        ...prev,
        [nextCondition.task_id]: prev[nextCondition.task_id].map((item) => (
          item.id === conditionId ? nextCondition : item
        )),
      }
    })
  }, [projectConditions, setInlineConditionsMap, setProjectConditions, setTaskConditions])

  const resetNewConditionForm = useCallback(() => {
    setNewConditionName('')
    setNewConditionType('other')
    setNewConditionTargetDate('')
    setNewConditionDescription('')
    setNewConditionResponsibleUnit('')
    setNewConditionPrecedingTaskIds([])
  }, [
    setNewConditionDescription,
    setNewConditionName,
    setNewConditionPrecedingTaskIds,
    setNewConditionResponsibleUnit,
    setNewConditionTargetDate,
    setNewConditionType,
  ])

  const openConditionDialog = useCallback(async (task: Task) => {
    const nextConditions = projectConditions.filter((condition) => condition.task_id === task.id) as TaskCondition[]

    setConditionTask(task)
    setConditionDialogOpen(true)
    setConditionsLoading(true)
    setNewConditionName('')
    setTaskConditions(nextConditions)
    try {
      setConditionPrecedingTasks(await fetchTaskConditionPrecedingTaskMap(nextConditions))
    } catch {
      toast({ title: '加载条件失败', variant: 'destructive' })
    } finally {
      setConditionsLoading(false)
    }
  }, [
    projectConditions,
    setConditionDialogOpen,
    setConditionPrecedingTasks,
    setConditionTask,
    setConditionsLoading,
    setNewConditionName,
    setTaskConditions,
  ])

  const submitConditionDraft = useCallback(async (draft: NewConditionFormValue) => {
    if (!draft.name.trim() || !conditionTask || !canEdit) return
    try {
      const nextCondition = await createTaskCondition({
        task: conditionTask,
        name: draft.name,
        type: draft.type,
        targetDate: draft.targetDate,
        description: draft.description,
        participantUnitId: draft.participantUnitId && participantUnits.some((unit) => unit.id === draft.participantUnitId)
          ? draft.participantUnitId
          : null,
        precedingTaskIds: newConditionPrecedingTaskIds,
      })
      setProjectConditions(toStoreConditionRecords([...projectConditions, nextCondition]))
      setTaskConditions((prev) => [...prev, nextCondition])
      setInlineConditionsMap((prev) => {
        if (!conditionTask || !prev[conditionTask.id]) return prev
        return {
          ...prev,
          [conditionTask.id]: [...prev[conditionTask.id], nextCondition],
        }
      })
      resetNewConditionForm()
    } catch {
      toast({ title: '新增开工条件失败', variant: 'destructive' })
    }
  }, [
    canEdit,
    conditionTask,
    newConditionPrecedingTaskIds,
    participantUnits,
    projectConditions,
    resetNewConditionForm,
    setInlineConditionsMap,
    setProjectConditions,
    setTaskConditions,
  ])

  const handleAddCondition = useCallback(async () => {
    await submitConditionDraft({
      name: newConditionName,
      type: newConditionType,
      targetDate: newConditionTargetDate || null,
      description: newConditionDescription || null,
      participantUnitId: newConditionResponsibleUnit || null,
    })
  }, [
    newConditionDescription,
    newConditionName,
    newConditionResponsibleUnit,
    newConditionTargetDate,
    newConditionType,
    submitConditionDraft,
  ])

  const handleAddConditionValue = useCallback(async (value: NewConditionFormValue) => {
    await submitConditionDraft(value)
  }, [submitConditionDraft])

  const handleToggleCondition = useCallback(async (cond: TaskCondition) => {
    if (!canEdit) return
    try {
      const nextCondition = await updateTaskCondition({
        conditionId: cond.id,
        values: { is_satisfied: !cond.is_satisfied },
        fallback: { ...cond, is_satisfied: !cond.is_satisfied },
      })
      replaceConditionInState(cond.id, nextCondition)
    } catch {
      toast({ title: '更新开工条件失败', variant: 'destructive' })
    }
  }, [canEdit, replaceConditionInState])

  const handleConfirmConditionSatisfied = useCallback((cond: TaskCondition) => {
    setConfirmCondition(cond)
    setConfirmConditionReason('')
    setConfirmConditionDialogOpen(true)
  }, [setConfirmCondition, setConfirmConditionDialogOpen, setConfirmConditionReason])

  const closeConfirmConditionDialog = useCallback(() => {
    setConfirmConditionDialogOpen(false)
    setConfirmCondition(null)
    setConfirmConditionReason('')
  }, [setConfirmCondition, setConfirmConditionDialogOpen, setConfirmConditionReason])

  const confirmConditionSatisfied = useCallback(async () => {
    if (!confirmCondition) return
    const trimmedReason = confirmConditionReason.trim()
    if (!trimmedReason) {
      toast({ title: '请先填写确认说明', variant: 'destructive' })
      return
    }
    try {
      const nextCondition = await updateTaskCondition({
        conditionId: confirmCondition.id,
        values: {
          is_satisfied: true,
          change_source: 'user_confirm',
          satisfied_reason: 'manual_confirmed',
          satisfied_reason_note: trimmedReason,
          change_reason: trimmedReason,
        },
        fallback: { ...confirmCondition, is_satisfied: true },
        errorMessage: '确认满足失败',
      })
      replaceConditionInState(confirmCondition.id, nextCondition)
      closeConfirmConditionDialog()
      toast({ title: '已确认满足条件', description: '确认说明和留痕已同步更新。' })
    } catch (error) {
      console.error('确认满足条件失败', error)
      toast({ title: '确认满足失败', variant: 'destructive' })
    }
  }, [
    closeConfirmConditionDialog,
    confirmCondition,
    confirmConditionReason,
    replaceConditionInState,
  ])

  const deleteCondition = useCallback(async (condId: string) => {
    try {
      await deleteTaskConditionRecord(condId)
      setProjectConditions(toStoreConditionRecords(projectConditions.filter((condition) => condition.id !== condId)))
      setTaskConditions((prev) => prev.filter((condition) => condition.id !== condId))
      if (conditionTask) {
        setInlineConditionsMap((prev) => {
          if (!prev[conditionTask.id]) return prev
          return {
            ...prev,
            [conditionTask.id]: prev[conditionTask.id].filter((condition) => condition.id !== condId),
          }
        })
      }
    } catch {
      toast({ title: '删除条件失败', variant: 'destructive' })
    }
  }, [
    conditionTask,
    projectConditions,
    setInlineConditionsMap,
    setProjectConditions,
    setTaskConditions,
  ])

  const handleDeleteCondition = useCallback((condId: string) => {
    if (!canEdit) return
    const targetName = taskConditions.find((condition) => condition.id === condId)?.name ?? '该开工条件'
    openConfirm(
      '删除开工条件',
      `确认删除“${targetName}”？删除后将从任务条件和行内条件中同步移除。`,
      () => {
        void deleteCondition(condId)
      },
    )
  }, [canEdit, deleteCondition, openConfirm, taskConditions])

  const toggleInlineConditions = useCallback(async (taskId: string, event: MouseEvent) => {
    event.stopPropagation()
    if (expandedConditionTaskId === taskId) {
      setExpandedConditionTaskId(null)
      return
    }
    setExpandedConditionTaskId(taskId)
    if (!inlineConditionsMap[taskId]) {
      setInlineConditionsMap((prev) => ({
        ...prev,
        [taskId]: projectConditions.filter((condition) => condition.task_id === taskId) as TaskCondition[],
      }))
    }
  }, [
    expandedConditionTaskId,
    inlineConditionsMap,
    projectConditions,
    setExpandedConditionTaskId,
    setInlineConditionsMap,
  ])

  return {
    confirmConditionSatisfied,
    handleAddCondition,
    handleAddConditionValue,
    handleConfirmConditionSatisfied,
    handleDeleteCondition,
    handleToggleCondition,
    openConditionDialog,
    toggleInlineConditions,
  }
}
