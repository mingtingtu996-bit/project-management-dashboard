import { useCallback, type Dispatch, type SetStateAction } from 'react'

import { toast } from '@/hooks/use-toast'
import { apiPost, getApiErrorMessage } from '@/lib/apiClient'
import { getRetentionApiUserMessage } from '@/lib/retentionError'
import type { PlanningTableOperation } from '@/components/planning/PlanningCommitModel'

import type { TaskObstacle } from '../GanttViewTypes'
import {
  buildCommitDeleteProtectionPayload,
  buildDeleteProtectionState,
  getDeleteProtectionDecisionToken,
  isRetentionConfirmationDetails,
  type DeleteGuardTarget,
} from './deleteProtection'
import { toStoreObstacleRecords } from './ganttViewUtils'
import { deleteTaskObstacleRecord } from './taskObstacleApi'

type CommitDeleteResult = {
  deletionResults?: Array<Record<string, unknown>>
}

type SetProjectObstacles = (obstacles: ReturnType<typeof toStoreObstacleRecords>) => void

type RefreshGanttProjectData = (options?: {
  signal?: AbortSignal
  includeSummary?: boolean
}) => Promise<unknown>

type UseGanttDeleteGuardActionsInput = {
  commitTaskListOperations: (operations: PlanningTableOperation[]) => Promise<CommitDeleteResult>
  deleteGuardSecondarySubmitting: boolean
  deleteGuardSubmitting: boolean
  deleteGuardTarget: DeleteGuardTarget | null
  deleteTask: (taskId: string) => void
  projectId?: string | null
  projectObstacles: TaskObstacle[]
  refreshGanttProjectData: RefreshGanttProjectData
  setDeleteGuardSubmitting: (submitting: boolean) => void
  setDeleteGuardTarget: Dispatch<SetStateAction<DeleteGuardTarget | null>>
  setProjectObstacles: SetProjectObstacles
  setTaskObstacles: Dispatch<SetStateAction<TaskObstacle[]>>
}

export function useGanttDeleteGuardActions({
  commitTaskListOperations,
  deleteGuardSecondarySubmitting,
  deleteGuardSubmitting,
  deleteGuardTarget,
  deleteTask,
  projectId,
  projectObstacles,
  refreshGanttProjectData,
  setDeleteGuardSubmitting,
  setDeleteGuardTarget,
  setProjectObstacles,
  setTaskObstacles,
}: UseGanttDeleteGuardActionsInput) {
  const closeDeleteGuard = useCallback(() => {
    if (deleteGuardSubmitting || deleteGuardSecondarySubmitting) return
    setDeleteGuardTarget(null)
  }, [deleteGuardSecondarySubmitting, deleteGuardSubmitting, setDeleteGuardTarget])

  const handleConfirmDeleteGuard = useCallback(async () => {
    if (!deleteGuardTarget) return
    if (deleteGuardTarget.blocked) {
      const decisionToken = getDeleteProtectionDecisionToken(deleteGuardTarget.details)
      if (!projectId || !isRetentionConfirmationDetails(deleteGuardTarget.details) || !decisionToken) {
        setDeleteGuardTarget(null)
        return
      }

      try {
        setDeleteGuardSubmitting(true)
        await apiPost('/api/deletion-retention/confirm', {
          projectId,
          decisionToken,
        })
        setDeleteGuardTarget(null)
        await refreshGanttProjectData({ includeSummary: true })
        toast({
          title: '已完成保留处置',
          description: `已按保留规则处理“${deleteGuardTarget.title}”。`,
        })
      } catch (error) {
        toast({
          title: '保留处置确认失败',
          description: getRetentionApiUserMessage(error, '请刷新后重试。'),
          variant: 'destructive',
        })
      } finally {
        setDeleteGuardSubmitting(false)
      }
      return
    }

    try {
      setDeleteGuardSubmitting(true)
      if (deleteGuardTarget.kind === 'task') {
        const committed = await commitTaskListOperations([{
          type: 'delete_row',
          rowId: deleteGuardTarget.id,
        }])
        const deleteResult = committed.deletionResults?.find((item) => item.rowId === deleteGuardTarget.id)
        if (deleteResult?.action === 'refused') {
          const nextGuard = buildDeleteProtectionState(
            'task',
            deleteGuardTarget.id,
            deleteGuardTarget.title,
            buildCommitDeleteProtectionPayload(deleteResult, '删除任务失败'),
          )
          if (nextGuard) {
            setDeleteGuardTarget(nextGuard)
            return
          }
          throw new Error('删除任务失败')
        }
        deleteTask(deleteGuardTarget.id)
        setDeleteGuardTarget(null)
        toast({ title: '任务已删除', description: `已移除“${deleteGuardTarget.title}”。` })
        return
      }

      const deleteResult = await deleteTaskObstacleRecord(deleteGuardTarget.id)
      if (deleteResult.blockedPayload) {
        const nextGuard = buildDeleteProtectionState(
          'obstacle',
          deleteGuardTarget.id,
          deleteGuardTarget.title,
          deleteResult.blockedPayload,
        )
        if (nextGuard) {
          setDeleteGuardTarget(nextGuard)
          return
        }
      }
      setProjectObstacles(toStoreObstacleRecords(projectObstacles.filter((obstacle) => obstacle.id !== deleteGuardTarget.id)))
      setTaskObstacles((prev) => prev.filter((obstacle) => obstacle.id !== deleteGuardTarget.id))
      setDeleteGuardTarget(null)
      toast({ title: '阻碍记录已删除', description: `已移除“${deleteGuardTarget.title}”。` })
    } catch (error) {
      toast({
        title: deleteGuardTarget.kind === 'task' ? '删除任务失败' : '删除阻碍失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setDeleteGuardSubmitting(false)
    }
  }, [
    commitTaskListOperations,
    deleteGuardTarget,
    deleteTask,
    projectId,
    projectObstacles,
    refreshGanttProjectData,
    setDeleteGuardSubmitting,
    setDeleteGuardTarget,
    setProjectObstacles,
    setTaskObstacles,
  ])

  return {
    closeDeleteGuard,
    handleConfirmDeleteGuard,
  }
}
