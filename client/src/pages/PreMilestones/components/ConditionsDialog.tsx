import type { Dispatch, SetStateAction } from 'react'
import {
  Calendar,
  CheckCircle,
  Trash2,
  X,
} from 'lucide-react'
import type {
  ConditionFormData,
  PreMilestone,
  PreMilestoneCondition,
} from '../types'

interface ConditionsDialogProps {
  selectedMilestone: PreMilestone | null
  conditions: PreMilestoneCondition[]
  conditionForm: ConditionFormData
  setConditionForm: Dispatch<SetStateAction<ConditionFormData>>
  onClose: () => void
  onAddCondition: () => void
  onUpdateConditionStatus: (conditionId: string, status: string) => void
  onDeleteCondition: (conditionId: string) => void
}

export function ConditionsDialog({
  selectedMilestone,
  conditions,
  conditionForm,
  setConditionForm,
  onClose,
  onAddCondition,
  onUpdateConditionStatus,
  onDeleteCondition,
}: ConditionsDialogProps) {
  if (!selectedMilestone) {
    return null
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{selectedMilestone.name} - 前置条件</h2>
            <p className="text-sm text-gray-500 mt-1">管理证照办理所需的各项前置条件</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-6 bg-gray-50 rounded-xl p-4 border border-gray-100">
            <h3 className="text-sm font-medium text-gray-900 mb-3">添加新条件</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">条件类型</label>
                <select
                  value={conditionForm.condition_type}
                  onChange={(event) => setConditionForm((previous) => ({ ...previous, condition_type: event.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">请选择</option>
                  <option value="资料">资料</option>
                  <option value="费用">费用</option>
                  <option value="审批">审批</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">目标日期</label>
                <input
                  type="date"
                  value={conditionForm.target_date}
                  onChange={(event) => setConditionForm((previous) => ({ ...previous, target_date: event.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                条件名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={conditionForm.condition_name}
                onChange={(event) => setConditionForm((previous) => ({ ...previous, condition_name: event.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">描述</label>
              <textarea
                value={conditionForm.description}
                onChange={(event) => setConditionForm((previous) => ({ ...previous, description: event.target.value }))}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={onAddCondition}
              disabled={!conditionForm.condition_name}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              添加条件
            </button>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">
              条件列表 ({conditions.length})
            </h3>
            {conditions.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-xl border border-gray-100">
                <CheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">暂无前置条件</p>
              </div>
            ) : (
              <div className="space-y-3">
                {conditions.map((condition) => (
                  <div
                    key={condition.id}
                    className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                            {condition.condition_type}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            condition.status === '已确认' ? 'bg-emerald-100 text-emerald-700' :
                            condition.status === '已满足' ? 'bg-blue-100 text-blue-700' :
                            condition.status === '未满足' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-700'
                          }`}
                          >
                            {condition.status}
                          </span>
                        </div>
                        <h4 className="font-medium text-gray-900 mb-1">{condition.condition_name}</h4>
                        {condition.description && (
                          <p className="text-sm text-gray-600 mb-2">{condition.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          {condition.target_date && (
                            <div className="flex items-center">
                              <Calendar className="w-3 h-3 mr-1" />
                              {condition.target_date}
                            </div>
                          )}
                          {condition.completed_date && (
                            <div className="flex items-center text-emerald-600">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              {condition.completed_date}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {condition.status === '待处理' && (
                          <button
                            onClick={() => onUpdateConditionStatus(condition.id, '已满足')}
                            className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-md hover:bg-emerald-200 text-xs font-medium transition-colors"
                          >
                            标记完成
                          </button>
                        )}
                        {condition.status === '已满足' && (
                          <button
                            onClick={() => onUpdateConditionStatus(condition.id, '已确认')}
                            className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 text-xs font-medium transition-colors"
                          >
                            确认
                          </button>
                        )}
                        <button
                          onClick={() => onDeleteCondition(condition.id)}
                          className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
