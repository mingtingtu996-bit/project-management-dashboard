import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle, Lock, Unlock } from 'lucide-react'

interface BaselineHeaderProps {
  draftStatus: 'idle' | 'editing' | 'dirty' | 'saving' | 'locked'
  readOnly: boolean
  lockRemainingLabel: string
  isDirty: boolean
  lastSavedLabel: string
  onForceUnlock: () => void
}

function getStatusLabel(draftStatus: BaselineHeaderProps['draftStatus']) {
  if (draftStatus === 'locked') return '已锁定'
  if (draftStatus === 'saving') return '保存中'
  if (draftStatus === 'dirty') return '未保存'
  if (draftStatus === 'editing') return '编辑中'
  return '空闲'
}

export function BaselineHeader({
  draftStatus,
  readOnly,
  lockRemainingLabel,
  isDirty,
  lastSavedLabel,
  onForceUnlock,
}: BaselineHeaderProps) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3.5 w-3.5" />
                项目基线
              </Badge>
              <Badge variant={readOnly ? 'outline' : 'secondary'}>{readOnly ? '只读查看态' : '可编辑态'}</Badge>
              <Badge variant="outline">{getStatusLabel(draftStatus)}</Badge>
              {isDirty ? (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                  ● 未保存更改
                </Badge>
              ) : null}
            </div>
          </div>

          <Button type="button" variant="outline" className="gap-2" onClick={onForceUnlock}>
            <Unlock className="h-4 w-4" />
            强制解锁
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <div className="text-xs text-slate-500">锁剩余时间</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{lockRemainingLabel}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <div className="text-xs text-slate-500">查看状态</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{readOnly ? '只读查看' : '允许编辑'}</div>
          </div>
          <div className="rounded-2xl bg-cyan-50 px-4 py-3 text-cyan-900">
            <div className="text-xs text-cyan-700">最近暂存</div>
            <div className="mt-1 text-sm font-semibold">{lastSavedLabel}</div>
          </div>
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-900">
            <div className="flex items-center gap-2 text-xs">
              <AlertTriangle className="h-3.5 w-3.5" />
              提醒
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default BaselineHeader
