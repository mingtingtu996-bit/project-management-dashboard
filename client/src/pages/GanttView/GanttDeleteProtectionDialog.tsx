import { DeleteProtectionDialog } from '@/components/DeleteProtectionDialog'
import {
  buildRetentionDecisionDialogModel,
  buildRetentionDecisionPayload,
} from '@/lib/retentionError'

import {
  isRetentionConfirmationDetails,
  type DeleteGuardTarget,
} from './deleteProtection'

type GanttDeleteProtectionDialogProps = {
  target: DeleteGuardTarget | null
  submitting: boolean
  secondarySubmitting: boolean
  onClose: () => void
  onConfirm: () => void
  onCloseObstacle: (obstacleId: string) => void
}

export function GanttDeleteProtectionDialog({
  target,
  submitting,
  secondarySubmitting,
  onClose,
  onConfirm,
  onCloseObstacle,
}: GanttDeleteProtectionDialogProps) {
  const requiresRetentionConfirmation = Boolean(
    target?.blocked && isRetentionConfirmationDetails(target.details),
  )
  const retentionDialogModel = buildRetentionDecisionDialogModel({
    title: target?.kind === 'task' ? '删除任务' : '删除阻碍记录',
    entityName: target?.title ?? '',
    fallbackDescription: target?.kind === 'task'
      ? `确认删除“${target?.title ?? ''}”吗？删除后会移除任务行及其入口。`
      : `确认删除“${target?.title ?? ''}”吗？删除后会移除该条阻碍记录。`,
    retention: buildRetentionDecisionPayload(target?.details ?? null),
  })

  return (
    <DeleteProtectionDialog
      open={Boolean(target)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={
        target
          ? requiresRetentionConfirmation
            ? retentionDialogModel.title
            : target.blocked
            ? target.kind === 'task'
              ? '任务暂不可删除'
              : '阻碍记录暂不可删除'
            : target.kind === 'task'
              ? '删除任务'
              : '删除阻碍记录'
          : '删除记录'
      }
      description={
        target
          ? requiresRetentionConfirmation
            ? retentionDialogModel.description
            : target.blocked
            ? target.message || '当前记录仍被链路引用，暂时无法删除。'
            : target.kind === 'task'
              ? `确认删除“${target.title}”吗？删除后会移除任务行及其入口。`
              : `确认删除“${target.title}”吗？删除后会移除该条阻碍记录。`
          : '确认删除当前记录。'
      }
      warning={
        target
          ? requiresRetentionConfirmation
            ? target.warning || '确认后不会回写历史基线或历史月计划，只更新当前执行事实的处置状态。'
            : target.blocked
            ? target.warning || (
              target.kind === 'task'
                ? '请先处理子任务、开工条件或执行记录引用，再删除该施工任务。'
                : '如果还需要保留执行留痕，请直接使用“关闭此记录”；若确实要删除，请先解除引用链路后再试。'
            )
            : target.kind === 'task'
              ? '删除后，该施工任务将不再进入后续月度计划、基线重编和任务跟踪。'
              : '当前记录仍被业务链路引用；如需保留留痕，请使用关闭此记录。'
          : undefined
      }
      confirmLabel={
        requiresRetentionConfirmation
          ? retentionDialogModel.confirmLabel
          : target?.blocked
            ? '知道'
            : '确认删除'
      }
      confirmTone={requiresRetentionConfirmation ? retentionDialogModel.confirmTone : 'destructive'}
      secondaryActionLabel={
        target && target.kind === 'obstacle'
          ? target.details?.close_action?.label || '关闭此记录'
          : undefined
      }
      secondaryActionLoading={secondarySubmitting}
      loading={submitting}
      onSecondaryAction={() => {
        if (!target) return
        onCloseObstacle(target.id)
      }}
      onConfirm={onConfirm}
      testId="gantt-delete-protection-dialog"
    />
  )
}
