import {
  Calendar,
  CheckCircle,
  Edit2,
  Trash2,
  X,
} from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import { Separator } from '@/components/ui/separator'
import type {
  ConditionFormData,
  PreMilestone,
  PreMilestoneCondition,
} from '../types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface ConditionsDialogProps {
  selectedMilestone: PreMilestone | null
  conditions: PreMilestoneCondition[]
  conditionForm: ConditionFormData
  setConditionForm: Dispatch<SetStateAction<ConditionFormData>>
  editingConditionId?: string | null
  onClose: () => void
  onSubmitCondition: () => void
  onStartEditCondition: (condition: PreMilestoneCondition) => void
  onCancelEditCondition: () => void
  onUpdateConditionStatus: (conditionId: string, status: string) => void
  onDeleteCondition: (conditionId: string) => void
  readOnly?: boolean
}

export function ConditionsDialog({
  selectedMilestone,
  conditions,
  conditionForm,
  setConditionForm,
  editingConditionId,
  onClose,
  onSubmitCondition,
  onStartEditCondition,
  onCancelEditCondition,
  onUpdateConditionStatus,
  onDeleteCondition,
  readOnly = false,
}: ConditionsDialogProps) {
  if (!selectedMilestone) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-[4px] duration-200 fade-in-0">
      <div className="max-h-[90vh] w-[90%] max-w-[720px] animate-in overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[var(--el-4)] duration-200 ease-bounce fade-in-0 zoom-in-95">
        <div className="flex items-center justify-between p-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{selectedMilestone.name} - 前置条件</h2>
            <p className="text-sm text-slate-500 mt-1">管理证照办理所需的各项前置条件</p>
          </div>
          <Button variant="ghost"
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
        <Separator />

        <div className="p-6">
          {!readOnly ? (
            <div className="mb-6 bg-slate-50 rounded-xl p-4 border border-slate-100">
              <h3 className="text-sm font-medium text-slate-900 mb-3">添加新条件</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">条件类型</label>
                  <Select
                    value={conditionForm.condition_type}
                    onValueChange={(value) => setConditionForm((previous) => ({ ...previous, condition_type: value }))}
                  >
                    <SelectTrigger className="h-10 rounded-xl border-slate-300 bg-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">请选择</SelectItem>
                      <SelectItem value="资料">资料</SelectItem>
                      <SelectItem value="费用">费用</SelectItem>
                      <SelectItem value="审批">审批</SelectItem>
                      <SelectItem value="其他">其他</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">目标日期</label>
                  <input
                    type="date"
                    value={conditionForm.target_date}
                    onChange={(event) => setConditionForm((previous) => ({ ...previous, target_date: event.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  条件名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={conditionForm.condition_name}
                  onChange={(event) => setConditionForm((previous) => ({ ...previous, condition_name: event.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-700 mb-1">描述</label>
                <textarea
                  value={conditionForm.description}
                  onChange={(event) => setConditionForm((previous) => ({ ...previous, description: event.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <Button variant="ghost"
                onClick={onSubmitCondition}
                disabled={!conditionForm.condition_name}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingConditionId ? '保存修改' : '添加条件'}
              </Button>
              {editingConditionId ? (
                <Button variant="ghost"
                  onClick={onCancelEditCondition}
                  className="ml-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm hover:bg-slate-200"
                >
                  取消编辑
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="mb-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              当前为只读模式，仅可查看条件清单。
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium text-slate-900 mb-3">
              条件列表 ({conditions.length})
            </h3>
            {conditions.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-100">
                <CheckCircle className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500">暂无前置条件</p>
              </div>
            ) : (
              <div className="space-y-3">
                {conditions.map((condition) => (
                  <Card
                    key={condition.id}
                    className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
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
                            'bg-slate-100 text-slate-700'
                          }`}
                          >
                            {condition.status}
                          </span>
                        </div>
                        <h4 className="font-medium text-slate-900 mb-1">{condition.condition_name}</h4>
                        {condition.description && (
                          <p className="text-sm text-slate-600 mb-2">{condition.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          {condition.target_date && (
                            <div className="flex items-center">
                              <Calendar className="w-3.5 h-3.5 mr-1" />
                              {condition.target_date}
                            </div>
                          )}
                          {condition.completed_date && (
                            <div className="flex items-center text-emerald-600">
                              <CheckCircle className="w-3.5 h-3.5 mr-1" />
                              {condition.completed_date}
                            </div>
                          )}
                        </div>
                      </div>

                      {!readOnly ? (
                        <div className="flex items-center gap-2">
                          <Button variant="ghost"
                            onClick={() => onStartEditCondition(condition)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-blue-600"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          {condition.status === '待处理' && (
                            <Button variant="ghost"
                              onClick={() => onUpdateConditionStatus(condition.id, '已满足')}
                              className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-md hover:bg-emerald-200 text-xs font-medium transition-colors"
                            >
                              标记完成
                            </Button>
                          )}
                          {condition.status === '已满足' && (
                            <Button variant="ghost"
                              onClick={() => onUpdateConditionStatus(condition.id, '已确认')}
                              className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 text-xs font-medium transition-colors"
                            >
                              确认
                            </Button>
                          )}
                          <Button variant="ghost"
                            onClick={() => onDeleteCondition(condition.id)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
