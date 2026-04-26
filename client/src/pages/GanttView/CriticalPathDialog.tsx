import { AlertTriangle } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  summarizeCriticalPathSnapshot,
  type CriticalPathOverrideInput,
  type CriticalPathOverrideRecord,
  type CriticalPathSnapshot,
} from '@/lib/criticalPath'
import { CriticalPathGraph } from '@/components/CriticalPathGraph'
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
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
  onNodeNavigate?: (taskId: string) => void
}

export function CriticalPathDialog(props: CriticalPathDialogProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragStateRef = useRef<{
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  useEffect(() => {
    if (!props.open) {
      setOffset({ x: 0, y: 0 })
      dragStateRef.current = null
    }
  }, [props.open])

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current
      if (!dragState) return
      setOffset({
        x: dragState.originX + (event.clientX - dragState.startX),
        y: dragState.originY + (event.clientY - dragState.startY),
      })
    }

    const onPointerUp = () => {
      dragStateRef.current = null
      document.body.style.cursor = ''
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [])

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    }
    document.body.style.cursor = 'grabbing'
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        centered={false}
        className="max-w-none overflow-hidden p-0"
        data-testid="critical-path-dialog"
        style={{
          left: '50%',
          top: '50%',
          width: 'max(80vw, 960px)',
          height: 'max(70vh, 600px)',
          maxWidth: '96vw',
          maxHeight: '90vh',
          transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
          resize: 'both',
          padding: 0,
          overflow: 'hidden',
        }}
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div
            className="flex cursor-grab items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-6 py-3 active:cursor-grabbing"
            onPointerDown={startDrag}
            data-testid="critical-path-dialog-drag-handle"
          >
            <div className="min-w-0">
              <DialogHeader className="space-y-1 text-left">
                <DialogTitle>关键路径图谱</DialogTitle>
                <DialogDescription className="sr-only">查看项目关键路径网络图和覆盖规则</DialogDescription>
                <div className="text-xs text-muted-foreground">
                  {summarizeCriticalPathSnapshot(props.snapshot) || '等待关键路径快照加载'}
                </div>
              </DialogHeader>
            </div>
            <div className="shrink-0 text-xs text-slate-500">拖动此处移动，右下角可调整大小</div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
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
              onNodeNavigate={props.onNodeNavigate}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
