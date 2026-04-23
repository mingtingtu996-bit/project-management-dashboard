import { AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  summarizeCriticalPathSnapshot,
  type CriticalPathOverrideInput,
  type CriticalPathOverrideRecord,
  type CriticalPathSnapshot,
} from '@/lib/criticalPath'
import { CriticalPathGraph } from '@/components/CriticalPathGraph'
import type { Task } from '../GanttViewTypes'

interface CriticalPathDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectName?: string
  tasks: Task[]
  snapshot: CriticalPathSnapshot | null
  overrides: CriticalPathOverrideRecord[]
  focusTaskId?: string | null
  loading?: boolean
  error?: string | null
  actionLoading?: boolean
  onRefresh: () => void | Promise<void>
  onCreateOverride: (input: CriticalPathOverrideInput) => void | Promise<void>
  onDeleteOverride: (overrideId: string) => void | Promise<void>
}

export function CriticalPathDialog(props: CriticalPathDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-6xl overflow-hidden" data-testid="critical-path-dialog">
        <DialogHeader>
          <DialogTitle>关键路径图谱</DialogTitle>
          <DialogDescription className="sr-only">查看项目关键路径网络图和覆盖规则</DialogDescription>
          <div className="text-xs text-muted-foreground">
            {summarizeCriticalPathSnapshot(props.snapshot) || '等待关键路径快照加载'}
          </div>
        </DialogHeader>

        <div className="max-h-[82vh] overflow-y-auto pr-1">
          {props.snapshot?.hasCycleDetected && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800" data-testid="critical-path-cycle-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <span className="font-semibold">检测到依赖环，关键路径已回退到兜底排序。</span>
                {props.snapshot.cycleTaskIds && props.snapshot.cycleTaskIds.length > 0 && (
                  <span className="ml-1">涉及任务 ID：{props.snapshot.cycleTaskIds.join('、')}</span>
                )}
                <span className="ml-1">请检查任务依赖关系并消除循环引用。</span>
              </div>
            </div>
          )}
          <CriticalPathGraph
            projectName={props.projectName}
            tasks={props.tasks}
            snapshot={props.snapshot}
            overrides={props.overrides}
            focusTaskId={props.focusTaskId}
            loading={props.loading}
            error={props.error}
            actionLoading={props.actionLoading}
            onRefresh={props.onRefresh}
            onCreateOverride={props.onCreateOverride}
            onDeleteOverride={props.onDeleteOverride}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
