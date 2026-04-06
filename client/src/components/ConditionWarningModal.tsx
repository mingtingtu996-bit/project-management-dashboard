import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertTriangle, Bell } from 'lucide-react'

interface ConditionWarningModalProps {
  projectId?: string
}

export function ConditionWarningModal({ projectId }: ConditionWarningModalProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const handleGoToRiskCenter = () => {
    setOpen(false)
    if (projectId) {
      navigate(`/projects/${projectId}/risks`)
    } else {
      navigate('/notifications')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100">
              <Bell className="h-4 w-4 text-amber-600" />
            </span>
            <span>提醒汇总</span>
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            提醒入口已统一，这里只保留一个轻量提醒壳，不再单独拉取预警明细。
          </p>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center gap-2 py-8">
          <AlertTriangle className="h-10 w-10 text-amber-400" />
          <p className="text-sm font-medium text-slate-700">提醒已统一</p>
          <p className="text-xs text-muted-foreground">
            需要处理的事项请统一到“问题与风险”页查看。
          </p>
          {projectId && <p className="text-xs text-muted-foreground">当前项目：{projectId}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            稍后处理
          </Button>
          <Button onClick={handleGoToRiskCenter}>去问题与风险</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
