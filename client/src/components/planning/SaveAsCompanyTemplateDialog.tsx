// v1.4.22.1 §4.3.2: Save current project as company template dialog
import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultName: string
  businessType?: string
  onSave: (name: string, description: string, overwriteExisting: boolean) => void
  existingNames?: string[]
}

export function SaveAsCompanyTemplateDialog({ open, onOpenChange, defaultName, businessType, onSave, existingNames }: Props) {
  const [name, setName] = useState(defaultName)
  const [description, setDescription] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const nameConflict = (existingNames ?? []).includes(name) && !overwrite

  const handleSave = () => {
    if (!name.trim()) return
    onSave(name.trim(), description.trim(), overwrite)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>另存为公司模板</DialogTitle>
          <DialogDescription>
            保存当前项目的业态、工法、特征和范围树为模板，下次新建项目可复用。
            {businessType && <span className="block mt-1 text-xs text-slate-500">业态：{businessType}</span>}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tmpl-name">模板名称</Label>
            <Input id="tmpl-name" value={name} onChange={e => setName(e.target.value)} placeholder="输入模板名称" />
            {nameConflict && <p className="text-xs text-red-500">已存在同名模板，勾选"覆盖已有"以继续</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="tmpl-desc">描述（选填）</Label>
            <Input id="tmpl-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="简要描述模板用途" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} className="rounded border-slate-300" />
            覆盖已有同名模板
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSave} disabled={!name.trim() || nameConflict}>保存模板</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
