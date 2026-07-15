import { useCallback } from 'react'

import { toast } from '@/hooks/use-toast'
import { zhCN } from '@/i18n/zh-CN'

import type { Task } from '../GanttViewTypes'
import { MILESTONE_LEVEL_CONFIG } from '../GanttViewTypes'

type UseGanttMilestoneActionsInput = {
  enqueueTaskTableDraftPatch: (taskId: string, patch: Partial<Task>) => void
  milestoneTargetTask: Task | null
  setMilestoneDialogOpen: (open: boolean) => void
  setMilestoneTargetTask: (task: Task | null) => void
}

export function useGanttMilestoneActions({
  enqueueTaskTableDraftPatch,
  milestoneTargetTask,
  setMilestoneDialogOpen,
  setMilestoneTargetTask,
}: UseGanttMilestoneActionsInput) {
  const handleSelectMilestoneLevel = useCallback(async (level: number | null) => {
    if (!milestoneTargetTask?.id) return

    enqueueTaskTableDraftPatch(milestoneTargetTask.id, {
      is_milestone: level !== null,
      milestone_level: level ?? null,
    } as Partial<Task>)
    toast({
      title: level === null
        ? '已暂存取消里程碑标记'
        : zhCN.gantt.milestoneToast.replace('{label}', MILESTONE_LEVEL_CONFIG[level]?.label ?? '里程碑'),
      description: '保存编辑后生效。',
    })
    setMilestoneDialogOpen(false)
    setMilestoneTargetTask(null)
  }, [
    enqueueTaskTableDraftPatch,
    milestoneTargetTask,
    setMilestoneDialogOpen,
    setMilestoneTargetTask,
  ])

  return {
    handleSelectMilestoneLevel,
  }
}
