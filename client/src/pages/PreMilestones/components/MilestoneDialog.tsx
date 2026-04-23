import type { Dispatch, SetStateAction } from 'react'
import { X } from 'lucide-react'
import {
  MILESTONE_NAME_OPTIONS,
  MILESTONE_NAME_TO_TYPE_MAP,
  QUICK_MILESTONE_TYPES,
} from '../constants'
import type {
  PreMilestoneFormData,
  PreMilestoneDialogMode,
} from '../types'

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
  if (!mode) {
    return null
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">{mode === 'edit' ? '编辑证照' : '新建证照'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              证照名称 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                list="milestone-name-options"
                value={formData.name}
                onChange={(event) => {
                  const value = event.target.value
                  const inferredType = MILESTONE_NAME_TO_TYPE_MAP[value] || (value ? '其他' : '')
                  setFormData((previous) => ({
                    ...previous,
                    name: value,
                    milestone_type: inferredType || previous.milestone_type,
                  }))
                }}
                placeholder="选择或输入证照名称"
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="milestone-name-options">
                {MILESTONE_NAME_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {QUICK_MILESTONE_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFormData((previous) => ({ ...previous, name: type, milestone_type: type }))}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    formData.name === type
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">描述</label>
            <textarea
              value={formData.description}
              onChange={(event) => setFormData((previous) => ({ ...previous, description: event.target.value }))}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">计划开始日期</label>
              <input
                type="date"
                value={formData.planned_start_date}
                onChange={(event) => setFormData((previous) => ({ ...previous, planned_start_date: event.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">计划结束日期</label>
              <input
                type="date"
                value={formData.planned_end_date}
                onChange={(event) => setFormData((previous) => ({ ...previous, planned_end_date: event.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">牵头单位</label>
            <input
              type="text"
              value={formData.lead_unit}
              onChange={(event) => setFormData((previous) => ({ ...previous, lead_unit: event.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">备注</label>
            <textarea
              value={formData.notes}
              onChange={(event) => setFormData((previous) => ({ ...previous, notes: event.target.value }))}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-xl hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={onSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
