import { useState, type Dispatch, type SetStateAction } from 'react'
import {
  MILESTONE_NAME_OPTIONS,
  MILESTONE_NAME_TO_TYPE_MAP,
  QUICK_MILESTONE_TYPES,
} from '../constants'
import type {
  PreMilestoneFormData,
  PreMilestoneDialogMode,
} from '../types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface MilestoneDialogProps {
  mode: Extract<PreMilestoneDialogMode, 'create' | 'edit'> | null
  formData: PreMilestoneFormData
  setFormData: Dispatch<SetStateAction<PreMilestoneFormData>>
  onClose: () => void
  onSave: () => void
}

export function MilestoneDialog({
  mode,
  formData,
  setFormData,
  onClose,
  onSave,
}: MilestoneDialogProps) {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const clearFieldError = (field: string) => {
    setFieldErrors((current) => {
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const validateRequired = (field: string, value: string) => {
    if (value.trim()) {
      clearFieldError(field)
      return true
    }

    setFieldErrors((current) => ({ ...current, [field]: '此字段必填' }))
    return false
  }

  const handleClose = () => {
    setFieldErrors({})
    onClose()
  }

  const handleSave = () => {
    if (!validateRequired('name', formData.name)) return
    onSave()
  }

  if (!mode) {
    return null
  }

  return (
    <Dialog open={Boolean(mode)} onOpenChange={(open) => {
      if (!open) handleClose()
    }}>
      <DialogContent className="max-h-[calc(100vh-4rem)] max-w-[var(--dialog-md-width)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? '编辑证照' : '新建证照'}</DialogTitle>
          <DialogDescription>维护证照名称、计划日期、牵头单位和备注。</DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              证照名称 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                list="milestone-name-options"
                value={formData.name}
                onChange={(event) => {
                  const value = event.target.value
                  if (fieldErrors.name) clearFieldError('name')
                  const inferredType = MILESTONE_NAME_TO_TYPE_MAP[value] || (value ? '其他' : '')
                  setFormData((previous) => ({
                    ...previous,
                    name: value,
                    milestone_type: inferredType || previous.milestone_type,
                  }))
                }}
                onBlur={() => validateRequired('name', formData.name)}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? 'milestone-name-error' : undefined}
                placeholder="选择或输入证照名称"
                className={`w-full px-4 py-2 border rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${fieldErrors.name ? 'border-red-500' : 'border-slate-300'}`}
              />
              <datalist id="milestone-name-options">
                {MILESTONE_NAME_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>
            {fieldErrors.name ? (
              <p id="milestone-name-error" className="text-sm text-red-600" role="alert">
                {fieldErrors.name}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 mt-2">
              {QUICK_MILESTONE_TYPES.map((type) => (
                <Button variant="ghost"
                  key={type}
                  type="button"
                  onClick={() => setFormData((previous) => ({ ...previous, name: type, milestone_type: type }))}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    formData.name === type
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'
                  }`}
                >
                  {type}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">描述</label>
            <textarea
              value={formData.description}
              onChange={(event) => setFormData((previous) => ({ ...previous, description: event.target.value }))}
              rows={3}
              className="w-full px-4 py-2 border border-slate-300 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">计划开始日期</label>
              <input
                type="date"
                value={formData.planned_start_date}
                onChange={(event) => setFormData((previous) => ({ ...previous, planned_start_date: event.target.value }))}
                className="w-full px-4 py-2 border border-slate-300 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">计划结束日期</label>
              <input
                type="date"
                value={formData.planned_end_date}
                onChange={(event) => setFormData((previous) => ({ ...previous, planned_end_date: event.target.value }))}
                className="w-full px-4 py-2 border border-slate-300 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">牵头单位</label>
            <input
              type="text"
              value={formData.lead_unit}
              onChange={(event) => setFormData((previous) => ({ ...previous, lead_unit: event.target.value }))}
              className="w-full px-4 py-2 border border-slate-300 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">备注</label>
            <textarea
              value={formData.notes}
              onChange={(event) => setFormData((previous) => ({ ...previous, notes: event.target.value }))}
              rows={2}
              className="w-full px-4 py-2 border border-slate-300 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
          </div>
        </div>

        <DialogFooter className="gap-3">
          <Button variant="outline"
            onClick={handleClose}
          >
            取消
          </Button>
          <Button
            onClick={handleSave}
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
