import { AlertTriangle, X, RefreshCw } from 'lucide-react'
import { ConflictItem } from '@/hooks/useConflictDetection'

/**
 * 冲突警告提示属性
 */
interface ConflictAlertProps {
  conflicts: ConflictItem[]
  onViewDetails: () => void
  onDismiss: () => void
}

/**
 * 冲突警告提示组件
 * 显示在页面顶部的冲突提醒
 */
export function ConflictAlert({ conflicts, onViewDetails, onDismiss }: ConflictAlertProps) {
  if (conflicts.length === 0) return null

  const entityTypeLabels = {
    project: '项目',
    task: '任务',
    risk: '风险',
    milestone: '里程碑',
    member: '成员',
    invitation: '邀请'
  }

  const groupedConflicts = conflicts.reduce((acc, conflict) => {
    if (!acc[conflict.entityType]) {
      acc[conflict.entityType] = []
    }
    acc[conflict.entityType].push(conflict)
    return acc
  }, {} as Record<string, ConflictItem[]>)

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      <div className="bg-amber-50 border border-amber-200 rounded-xl shadow-lg overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 bg-amber-100">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <span className="font-medium text-amber-800">
              检测到 {conflicts.length} 个冲突
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="text-amber-600 hover:text-amber-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4">
          <div className="space-y-2 mb-4">
            {Object.entries(groupedConflicts).map(([entityType, items]) => (
              <div key={entityType} className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">{entityTypeLabels[entityType as keyof typeof entityTypeLabels]}:</span>
                <span className="font-medium text-gray-800">{items.length} 个</span>
                <span className="text-gray-400">
                  (v{items[0].localVersion} → v{items[0].serverVersion})
                </span>
              </div>
            ))}
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2">
            <button
              onClick={onViewDetails}
              className="flex-1 px-3 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              查看详情
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConflictAlert
