import type { Dispatch, SetStateAction } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LoadingState } from '@/components/ui/loading-state'
import { cn } from '@/lib/utils'

export type ParticipantUnitRecord = {
  id: string
  project_id?: string | null
  unit_name: string
  unit_type: string
  contact_name?: string | null
  contact_role?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  version: number
  created_at?: string
  updated_at?: string
}

export type ParticipantUnitDraft = {
  id: string | null
  project_id: string
  unit_name: string
  unit_type: string
  contact_name: string
  contact_role: string
  contact_phone: string
  contact_email: string
  version: number | null
}

export interface ParticipantUnitsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  loading: boolean
  saving: boolean
  units: ParticipantUnitRecord[]
  draft: ParticipantUnitDraft
  setDraft: Dispatch<SetStateAction<ParticipantUnitDraft>>
  onSubmit: () => void
  onEdit: (unit: ParticipantUnitRecord) => void
  onDelete: (unit: ParticipantUnitRecord) => void
  onCreateNew: () => void
}

const QUICK_UNIT_TYPES = ['土建', '幕墙', '机电安装', '装饰装修', '园林景观', '市政配套', '智能化', '其他']

export function ParticipantUnitsDialog({
  open,
  onOpenChange,
  loading,
  saving,
  units,
  draft,
  setDraft,
  onSubmit,
  onEdit,
  onDelete,
  onCreateNew,
}: ParticipantUnitsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>参建单位台账</DialogTitle>
          <DialogDescription className="sr-only">参建单位台账</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">已维护单位</p>
              </div>
              <Button size="sm" variant="outline" onClick={onCreateNew}>
                <Plus className="mr-2 h-4 w-4" />
                新建单位
              </Button>
            </div>

            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {loading ? (
                <LoadingState
                  label="参建单位加载中"
                  className="min-h-24 rounded-lg border border-dashed bg-transparent"
                />
              ) : units.length > 0 ? (
                units.map((unit) => (
                  <div key={unit.id} className="rounded-lg border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{unit.unit_name}</p>
                        <p className="text-xs text-muted-foreground">{unit.unit_type}</p>
                        {unit.contact_name || unit.contact_phone || unit.contact_email ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {[unit.contact_name, unit.contact_role, unit.contact_phone, unit.contact_email].filter(Boolean).join(' / ')}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => onEdit(unit)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          编辑
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => onDelete(unit)}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          删除
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">暂无参建单位</div>
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
            <div className="space-y-2">
              <Label htmlFor="participant-unit-name">单位名称</Label>
              <Input
                id="participant-unit-name"
                value={draft.unit_name}
                onChange={(event) => setDraft((previous) => ({ ...previous, unit_name: event.target.value }))}
                placeholder="输入单位名称"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="participant-unit-type">单位类型</Label>
              <Input
                id="participant-unit-type"
                value={draft.unit_type}
                onChange={(event) => setDraft((previous) => ({ ...previous, unit_type: event.target.value }))}
                placeholder="例如：土建 / 幕墙 / 园林景观"
              />
              <div className="flex flex-wrap gap-2">
                {QUICK_UNIT_TYPES.map((type) => (
                  <Button
                    key={type}
                    type="button"
                    size="sm"
                    variant={draft.unit_type === type ? 'default' : 'outline'}
                    className={cn('h-7 px-3 text-xs')}
                    onClick={() => setDraft((previous) => ({ ...previous, unit_type: type }))}
                  >
                    {type}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="participant-unit-contact-name">联系人</Label>
                <Input
                  id="participant-unit-contact-name"
                  value={draft.contact_name}
                  onChange={(event) => setDraft((previous) => ({ ...previous, contact_name: event.target.value }))}
                  placeholder="输入联系人姓名"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="participant-unit-contact-role">岗位</Label>
                <Input
                  id="participant-unit-contact-role"
                  value={draft.contact_role}
                  onChange={(event) => setDraft((previous) => ({ ...previous, contact_role: event.target.value }))}
                  placeholder="例如：项目经理 / 现场负责人"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="participant-unit-contact-phone">联系电话</Label>
                <Input
                  id="participant-unit-contact-phone"
                  value={draft.contact_phone}
                  onChange={(event) => setDraft((previous) => ({ ...previous, contact_phone: event.target.value }))}
                  placeholder="输入手机号或座机"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="participant-unit-contact-email">邮箱</Label>
                <Input
                  id="participant-unit-contact-email"
                  value={draft.contact_email}
                  onChange={(event) => setDraft((previous) => ({ ...previous, contact_email: event.target.value }))}
                  placeholder="输入联系邮箱"
                />
              </div>
            </div>

          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div />
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
            <Button type="button" onClick={onSubmit} disabled={saving}>
              {saving ? '保存中...' : draft.id ? '保存修改' : '新增单位'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
