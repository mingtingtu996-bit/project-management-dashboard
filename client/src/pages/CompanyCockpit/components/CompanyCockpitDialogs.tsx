import { DeleteProtectionDialog } from '@/components/DeleteProtectionDialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Project } from '@/lib/localDb'
import type { ProjectFormStatus } from '../types'

const STATUS_OPTIONS: ProjectFormStatus[] = ['未开始', '进行中', '已完成', '已暂停']

interface CompanyCockpitDialogsProps {
  dialogOpen: boolean
  onDialogChange: (open: boolean) => void
  dialogMode: 'create' | 'edit'
  form: { name: string; description: string; status: ProjectFormStatus }
  onFormChange: (next: { name: string; description: string; status: ProjectFormStatus }) => void
  submitting: boolean
  onSubmit: () => void
  deleteTarget: Project | null
  onDeleteTargetChange: (project: Project | null) => void
  onDelete: () => void
}

export function CompanyCockpitDialogs({
  dialogOpen,
  onDialogChange,
  dialogMode,
  form,
  onFormChange,
  submitting,
  onSubmit,
  deleteTarget,
  onDeleteTargetChange,
  onDelete,
}: CompanyCockpitDialogsProps) {
  const isEditMode = dialogMode === 'edit'

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={onDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditMode ? '编辑项目' : '新建项目'}</DialogTitle>
            <DialogDescription className="sr-only">{isEditMode ? '编辑项目' : '新建项目'}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company-project-name">项目名称</Label>
              <Input
                id="company-project-name"
                value={form.name}
                onChange={(event) => onFormChange({ ...form, name: event.target.value })}
                placeholder="输入项目名称"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company-project-status">项目状态</Label>
              <Select
                value={form.status}
                onValueChange={(value: ProjectFormStatus) => onFormChange({ ...form, status: value })}
              >
                <SelectTrigger id="company-project-status">
                  <SelectValue placeholder="选择项目状态" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="company-project-description">项目描述</Label>
              <Textarea
                id="company-project-description"
                value={form.description}
                onChange={(event) => onFormChange({ ...form, description: event.target.value })}
                placeholder="补充项目范围、当前阶段或关键信息"
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onDialogChange(false)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={onSubmit} disabled={submitting}>
              {submitting ? (isEditMode ? '保存中...' : '创建中...') : isEditMode ? '保存变更' : '创建项目'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteProtectionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && onDeleteTargetChange(null)}
        title="删除项目"
        description={
          deleteTarget
            ? `将删除“${deleteTarget.name}”及其关联的摘要、任务、风险和专项数据。此操作不可撤销，请确认后继续。`
            : '确认是否删除当前项目及其关联摘要数据。'
        }
        warning="删除项目会级联移除项目级摘要与业务数据，请确认当前项目不再需要保留。"
        confirmLabel={submitting ? '删除中...' : '确认删除'}
        loading={submitting}
        onConfirm={onDelete}
        testId="project-delete-guard"
      />
    </>
  )
}
