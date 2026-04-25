import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { PlanningDraftResumeSnapshot } from '../draftPersistence'

interface PlanningDraftResumeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  snapshot: PlanningDraftResumeSnapshot | null
  onContinue: () => void
  onDiscard: () => void
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function PlanningDraftResumeDialog({
  open,
  onOpenChange,
  snapshot,
  onContinue,
  onDiscard,
}: PlanningDraftResumeDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="planning-draft-resume-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>检测到上次未收口的草稿工作区</AlertDialogTitle>
          <AlertDialogDescription>
            {snapshot
              ? `${snapshot.workspaceLabel} 的 ${snapshot.versionLabel} 在 ${formatDateTime(snapshot.updatedAt)} 留下了本地工作区状态。`
              : '当前检测到未收口的本地工作区状态。'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDiscard}>放弃本地状态</AlertDialogCancel>
          <AlertDialogAction onClick={onContinue}>继续编辑</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default PlanningDraftResumeDialog
