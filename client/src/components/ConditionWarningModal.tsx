import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertTriangle, Bell } from 'lucide-react'

interface ConditionWarningModalProps {
  projectId?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  taskTitle?: string | null
  pendingConditionCount?: number
}

export function ConditionWarningModal({
  projectId,
  open,
  onOpenChange,
  taskTitle,
  pendingConditionCount,
}: ConditionWarningModalProps) {
  const navigate = useNavigate()
  const [internalOpen, setInternalOpen] = useState(false)
  const resolvedOpen = open ?? internalOpen

  const setResolvedOpen = useCallback((nextOpen: boolean) => {
    if (open === undefined) {
      setInternalOpen(nextOpen)
    }
    onOpenChange?.(nextOpen)
  }, [onOpenChange, open])

  const handleGoToRiskCenter = () => {
    setResolvedOpen(false)
    if (projectId) {
      navigate(`/projects/${projectId}/risks`)
    } else {
      navigate('/notifications')
    }
  }

  return (
    <Dialog open={resolvedOpen} onOpenChange={setResolvedOpen}>
      <DialogContent className="max-w-md" data-testid="condition-warning-modal">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100">
              <Bell className="h-4 w-4 text-amber-600" />
            </span>
            <span>提醒汇总</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center gap-2 py-8">
          <AlertTriangle className="h-10 w-10 text-amber-400" />
          <p className="text-sm font-medium text-slate-700">
            {taskTitle || (pendingConditionCount ? `${pendingConditionCount} 项开工条件` : '提醒')}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setResolvedOpen(false)}>
            稍后处理
          </Button>
          <Button onClick={handleGoToRiskCenter}>去问题与风险</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
