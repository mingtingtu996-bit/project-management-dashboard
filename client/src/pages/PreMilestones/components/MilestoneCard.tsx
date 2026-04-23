import { Fragment } from 'react'
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Edit,
  FileText,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { PROCESS_STEPS, getProcessStep, getProgressPercent } from '../constants'
import type { PreMilestone } from '../types'
import { normalizeLicenseLifecycleStatus } from '../../preMilestonesLifecycle'
import { StatusBadge } from '@/components/ui/status-badge'

interface MilestoneCardProps {
  milestone: PreMilestone
  expanded: boolean
  onToggleExpand: (id: string) => void
  onManageConditions: (milestone: PreMilestone) => void
  onEdit: (milestone: PreMilestone) => void
  onDelete: (id: string) => void
}

export function MilestoneCard({
  milestone,
  expanded,
  onToggleExpand,
  onManageConditions,
  onEdit,
  onDelete,
}: MilestoneCardProps) {
  const lifecycleStatus = normalizeLicenseLifecycleStatus(milestone.status)
  const statusKey = lifecycleStatus === '已完成'
    ? 'completed'
    : lifecycleStatus === '进行中'
      ? 'processing'
      : lifecycleStatus === '已延期'
        ? 'overdue'
        : lifecycleStatus === '已取消'
          ? 'cancelled'
          : 'pending'

  const progressPercent = getProgressPercent(milestone)
  const currentStep = getProcessStep(milestone)
  const borderColor = statusKey === 'completed'
    ? 'border-emerald-200'
    : statusKey === 'processing'
      ? 'border-blue-200'
      : statusKey === 'overdue'
        ? 'border-red-200'
        : 'border-gray-200'
  const progressColor = statusKey === 'completed'
    ? 'bg-emerald-500'
    : statusKey === 'processing'
      ? 'bg-blue-500'
      : statusKey === 'overdue'
        ? 'bg-red-500'
        : statusKey === 'cancelled'
          ? 'bg-gray-400'
          : 'bg-amber-400'
  return (
    <div className={`bg-white rounded-xl border ${borderColor} shadow-sm hover:shadow-md transition-shadow p-4`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            statusKey === 'completed' ? 'bg-emerald-50' :
            statusKey === 'processing' ? 'bg-blue-50' :
            statusKey === 'overdue' ? 'bg-red-50' : 'bg-gray-100'
          }`}
          >
            {statusKey === 'completed' && <CheckCircle className="w-5 h-5 text-emerald-600" />}
            {statusKey === 'processing' && <Clock className="w-5 h-5 text-blue-600" />}
            {statusKey === 'overdue' && <AlertTriangle className="w-5 h-5 text-red-500" />}
            {statusKey === 'cancelled' && <X className="w-5 h-5 text-gray-400" />}
            {statusKey === 'pending' && <FileText className="w-5 h-5 text-gray-400" />}
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-gray-900 text-sm leading-tight truncate">{milestone.name}</h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{milestone.milestone_type}</p>
          </div>
        </div>
        <StatusBadge status={statusKey} fallbackLabel={lifecycleStatus} className="ml-2 whitespace-nowrap px-2 py-0.5 text-xs font-medium">
          {lifecycleStatus}
        </StatusBadge>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">办理进度</span>
          <span className="text-xs font-medium text-gray-700">{progressPercent}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
        <div className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          <span>{milestone.planned_end_date ? milestone.planned_end_date.slice(0, 10) : '未设置截止日'}</span>
        </div>
        {milestone.lead_unit && (
          <div className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            <span className="truncate max-w-[80px]">{milestone.lead_unit}</span>
          </div>
        )}
      </div>

      <button
        onClick={() => onToggleExpand(milestone.id)}
        className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-700 py-1.5 border-t border-gray-100 transition-colors"
      >
        <span className="font-medium">办理流程</span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="mt-2 pt-2">
          <div className="flex items-center">
            {PROCESS_STEPS.map((step, index) => {
              const isDone = currentStep >= index
              const isCurrent = currentStep === index && milestone.status !== '已完成'

              return (
                <Fragment key={step}>
                  <div className="flex flex-col items-center">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      isDone && milestone.status === '已完成'
                        ? 'bg-emerald-500 text-white'
                        : isCurrent
                          ? 'bg-blue-500 text-white ring-2 ring-blue-200'
                          : isDone
                            ? 'bg-blue-400 text-white'
                            : 'bg-gray-100 text-gray-400'
                    }`}
                    >
                      {isDone && !isCurrent ? (
                        milestone.status === '已完成' && index === 4
                          ? <CheckCircle className="w-3.5 h-3.5" />
                          : <span>{index + 1}</span>
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </div>
                    <span className={`text-xs mt-1 whitespace-nowrap ${
                      isCurrent ? 'text-blue-600 font-medium' :
                      isDone ? 'text-gray-600' : 'text-gray-400'
                    }`}
                    >
                      {step}
                    </span>
                  </div>
                  {index < PROCESS_STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-1 mb-4 ${
                      currentStep > index ? (milestone.status === '已完成' ? 'bg-emerald-400' : 'bg-blue-300') : 'bg-gray-200'
                    }`}
                    />
                  )}
                </Fragment>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-1.5 mt-3 pt-2 border-t border-gray-100">
        <button
          onClick={() => onManageConditions(milestone)}
          className="px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1"
        >
          <ChevronRight className="w-3.5 h-3.5" />
          前置条件
        </button>
        <button
          onClick={() => onEdit(milestone)}
          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 transition-colors"
          title="编辑"
        >
          <Edit className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(milestone.id)}
          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-red-600 transition-colors"
          title="删除"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
