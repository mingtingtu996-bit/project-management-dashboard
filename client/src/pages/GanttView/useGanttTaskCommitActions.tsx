import { useCallback, type Dispatch, type SetStateAction } from 'react'

import { ToastAction } from '@/components/ui/toast'
import { toast } from '@/hooks/use-toast'
import type { PlanningFieldRegistryResponse } from '@/hooks/usePlanningFieldRegistry'
import { getApiErrorMessage } from '@/lib/apiClient'
import { commitTaskListTable } from '@/services/planningCommitApi'
import type { PlanningTableOperation } from '@/components/planning/PlanningCommitModel'
import type { WbsAccelerationRecommendationIdentity } from '@/services/wbsTemplateGenerationApi'

import type { Task } from '../GanttViewTypes'
import {
  buildCommitDeleteProtectionPayload,
  buildDeleteProtectionState,
  type DeleteGuardTarget,
} from './deleteProtection'
import { toStoreTaskPatch, toStoreTaskRecord } from './ganttViewUtils'
import {
  buildTaskTableDraftDeletedIds,
  buildTaskTableDraftRows,
  buildTaskTableDraftOperations,
  type TaskTableDraftPatches,
} from './taskDraftUtils'

type CriticalPathNotice = {
  enteredCount: number
  leftCount: number
  focusTaskId?: string | null
}

type CriticalPathChangeSummary = {
  changed?: boolean
  enteredTaskIds?: string[]
  leftTaskIds?: string[]
}

type CommitTaskListResult = Awaited<ReturnType<typeof commitTaskListTable<Task>>>

type UseGanttTaskCommitActionsInput = {
  addTask: (task: ReturnType<typeof toStoreTaskRecord>) => void
  canEdit: boolean
  currentProjectId?: string | null
  fieldRegistryVersion?: string | null
  onOpenCriticalPathDialog: (taskId?: string | null) => void
  projectId?: string | null
  refetchFieldRegistry: () => Promise<PlanningFieldRegistryResponse | null>
  resetTaskTableDraftPatches: () => void
  setCriticalPathChangeNotice: Dispatch<SetStateAction<CriticalPathNotice | null>>
  setDeleteGuardTarget: Dispatch<SetStateAction<DeleteGuardTarget | null>>
  setTaskTableEditing: (editing: boolean) => void
  taskTableDraftPatches: TaskTableDraftPatches
  tasks: Task[]
  updateTask: (id: string, patch: ReturnType<typeof toStoreTaskPatch>) => void
}

export function useGanttTaskCommitActions({
  addTask,
  canEdit,
  currentProjectId,
  fieldRegistryVersion,
  onOpenCriticalPathDialog,
  projectId,
  refetchFieldRegistry,
  resetTaskTableDraftPatches,
  setCriticalPathChangeNotice,
  setDeleteGuardTarget,
  setTaskTableEditing,
  taskTableDraftPatches,
  tasks,
  updateTask,
}: UseGanttTaskCommitActionsInput) {
  const getTaskListFieldRegistryVersion = useCallback(async () => {
    if (fieldRegistryVersion) return fieldRegistryVersion

    const refreshedRegistry = await refetchFieldRegistry()
    const refreshedVersion = refreshedRegistry?.registryVersion
    if (!refreshedVersion) {
      throw new Error('字段注册表未加载，无法保存任务')
    }
    return refreshedVersion
  }, [fieldRegistryVersion, refetchFieldRegistry])

  const commitTaskListOperations = useCallback(async (
    operations: PlanningTableOperation[],
    accelerationRecommendation?: WbsAccelerationRecommendationIdentity | null,
  ) => {
    const resolvedProjectId = currentProjectId || projectId
    if (!resolvedProjectId) throw new Error('项目不存在，无法保存任务')
    if (operations.length === 0) throw new Error('没有需要保存的任务变更')
    const resolvedFieldRegistryVersion = await getTaskListFieldRegistryVersion()

    return commitTaskListTable<Task>({
      projectId: resolvedProjectId,
      fieldRegistryVersion: resolvedFieldRegistryVersion,
      operations,
      clientContext: {
        rollupRows: buildTaskTableDraftRows({
          tasks,
          draftPatches: taskTableDraftPatches,
          deletedIds: buildTaskTableDraftDeletedIds(taskTableDraftPatches),
          projectId: resolvedProjectId,
        }),
        ...(accelerationRecommendation
          ? {
              accelerationRecommendation: {
                id: accelerationRecommendation.id,
                recommendationHash: accelerationRecommendation.recommendationHash,
              },
            }
          : {}),
      },
    })
  }, [currentProjectId, getTaskListFieldRegistryVersion, projectId, taskTableDraftPatches, tasks])

  const applyCommittedTaskRows = useCallback((rows: Task[]) => {
    const existingTaskIds = new Set(tasks.map((task) => task.id))
    rows.forEach((row) => {
      if (existingTaskIds.has(row.id)) {
        updateTask(row.id, toStoreTaskPatch(row))
      } else {
        addTask(toStoreTaskRecord(row))
      }
    })
  }, [addTask, tasks, updateTask])

  const notifyCriticalPathChange = useCallback((summary?: CriticalPathChangeSummary | null) => {
    if (!summary?.changed) return false

    const enteredCount = summary.enteredTaskIds?.length ?? 0
    const leftCount = summary.leftTaskIds?.length ?? 0
    const affectedCount = enteredCount + leftCount
    const focusTaskId = summary.enteredTaskIds?.[0] ?? summary.leftTaskIds?.[0] ?? null

    setCriticalPathChangeNotice({ enteredCount, leftCount, focusTaskId })
    toast({
      title: '关键路径已更新',
      description: affectedCount > 0
        ? `本次保存影响 ${affectedCount} 个关键路径任务。`
        : '本次保存已触发关键路径重算。',
      action: (
        <ToastAction altText="查看关键路径" onClick={() => onOpenCriticalPathDialog(focusTaskId)}>
          查看
        </ToastAction>
      ),
    })
    return true
  }, [onOpenCriticalPathDialog, setCriticalPathChangeNotice])

  const handleSaveTaskTableDraft = useCallback(async () => {
    if (!canEdit) return
    const { operations, skippedProgressCount } = buildTaskTableDraftOperations(taskTableDraftPatches, tasks)
    if (operations.length === 0) {
      if (skippedProgressCount > 0) {
        resetTaskTableDraftPatches()
        setTaskTableEditing(false)
        toast({ title: `已跳过 ${skippedProgressCount} 个自动进度字段` })
      }
      return
    }

    try {
      const committed: CommitTaskListResult = await commitTaskListOperations(operations)
      const deletionResults = committed.deletionResults ?? []
      const refusedDeleteResult = deletionResults.find((item) => item.action === 'refused')
      if (refusedDeleteResult) {
        const taskId = String(refusedDeleteResult.rowId ?? '')
        const task = tasks.find((item) => item.id === taskId)
        const nextGuard = buildDeleteProtectionState(
          'task',
          taskId,
          task?.title || '未命名任务',
          buildCommitDeleteProtectionPayload(refusedDeleteResult, '保存删除失败'),
        )
        if (nextGuard) {
          setDeleteGuardTarget(nextGuard)
          return
        }
        throw new Error('保存删除失败')
      }
      applyCommittedTaskRows(committed.rows)
      resetTaskTableDraftPatches()
      setTaskTableEditing(false)

      const deletedCount = deletionResults.filter((result) => result.action === 'deleted').length
      const retainedCount = deletionResults.filter((result) => result.action === 'retained' || result.action === 'closed').length
      const hasDeletionSummary = deletionResults.length > 1 && (deletedCount > 0 || retainedCount > 0)
      const deletionDesc = hasDeletionSummary
        ? [
            deletedCount > 0 ? `${deletedCount} 项已删除` : '',
            retainedCount > 0 ? `${retainedCount} 项已保留关闭` : '',
          ].filter(Boolean).join(' / ')
        : ''

      toast({
        title: `已保存 ${operations.length} 行表格编辑`,
        description: [deletionDesc, skippedProgressCount > 0 ? `已跳过 ${skippedProgressCount} 个自动进度字段` : ''].filter(Boolean).join('，') || undefined,
      })
      notifyCriticalPathChange(committed.criticalPathChangeSummary)
    } catch (error) {
      toast({
        title: '保存表格编辑失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    }
  }, [
    applyCommittedTaskRows,
    canEdit,
    commitTaskListOperations,
    notifyCriticalPathChange,
    resetTaskTableDraftPatches,
    setDeleteGuardTarget,
    setTaskTableEditing,
    taskTableDraftPatches,
    tasks,
  ])

  return {
    applyCommittedTaskRows,
    commitTaskListOperations,
    handleSaveTaskTableDraft,
  }
}
