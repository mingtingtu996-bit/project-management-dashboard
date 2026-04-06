import { useState } from 'react'
import { ConflictItem, ResolutionStrategy, smartMerge, getFieldDifference } from '@/hooks/useConflictDetection'

/**
 * 冲突解决模态框属性
 */
interface ConflictResolutionModalProps {
  isOpen: boolean
  conflicts: ConflictItem[]
  onResolve: (entityId: string, strategy: ResolutionStrategy, mergedData?: any) => void
  onClose: () => void
}

/**
 * 冲突解决模态框组件
 * 让用户选择如何解决版本冲突
 */
export function ConflictResolutionModal({
  isOpen,
  conflicts,
  onResolve,
  onClose
}: ConflictResolutionModalProps) {
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null)
  const [showMergePreview, setShowMergePreview] = useState(false)

  if (!isOpen || conflicts.length === 0) return null

  const currentConflict = conflicts.find(c => c.entityId === selectedEntity) || conflicts[0]
  const entityTypeLabels = {
    project: '项目',
    task: '任务',
    risk: '风险',
    milestone: '里程碑',
    member: '成员',
    invitation: '邀请'
  }

  // 预览合并结果
  const previewMerge = () => {
    if (!currentConflict) return null
    return smartMerge(currentConflict.localData, currentConflict.serverData)
  }

  const handleResolve = (strategy: ResolutionStrategy) => {
    if (!currentConflict) return
    
    let mergedData: any
    if (strategy === 'merge') {
      mergedData = smartMerge(currentConflict.localData, currentConflict.serverData)
    }
    
    onResolve(currentConflict.entityId, strategy, mergedData)
    
    // 如果还有更多冲突，继续处理下一个
    if (conflicts.length > 1) {
      setSelectedEntity(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      
      {/* 模态框主体 */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-gray-200 bg-amber-50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-amber-800">
                数据冲突检测
              </h3>
              <p className="text-sm text-amber-600">
                检测到 {conflicts.length} 个冲突，请选择解决方案
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 冲突列表（如果有多个） */}
        {conflicts.length > 1 && (
          <div className="px-6 py-3 border-b border-gray-100">
            <div className="flex flex-wrap gap-2">
              {conflicts.map((conflict, index) => (
                <button
                  key={conflict.entityId}
                  onClick={() => setSelectedEntity(conflict.entityId)}
                  className={`px-3 py-1 text-sm rounded-full transition-colors ${
                    (selectedEntity || conflicts[0].entityId) === conflict.entityId
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {entityTypeLabels[conflict.entityType]} {index + 1}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 冲突详情 */}
        <div className="p-6 overflow-y-auto max-h-[40vh]">
          {currentConflict && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="px-2 py-0.5 bg-gray-100 rounded">
                  {entityTypeLabels[currentConflict.entityType]}
                </span>
                <span>版本 {currentConflict.localVersion} → {currentConflict.serverVersion}</span>
              </div>

              {/* 冲突字段列表 */}
              <div className="space-y-2">
                <h4 className="font-medium text-gray-700">冲突字段：</h4>
                {conflicts
                  .filter(c => c.entityId === currentConflict.entityId)
                  .map((conflict, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-red-50 border border-red-100 rounded-xl"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-red-800">
                          {getFieldDifference(conflict.field, conflict.localValue, conflict.serverValue)}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>

              {/* 数据预览 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
                  <h4 className="font-medium text-blue-800 mb-2">本地版本</h4>
                  <pre className="text-xs text-blue-700 whitespace-pre-wrap">
                    {JSON.stringify(currentConflict.localData, null, 2)}
                  </pre>
                </div>
                <div className="p-3 bg-green-50 border border-green-100 rounded-xl">
                  <h4 className="font-medium text-green-800 mb-2">服务器版本</h4>
                  <pre className="text-xs text-green-700 whitespace-pre-wrap">
                    {JSON.stringify(currentConflict.serverData, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex flex-wrap gap-3 justify-end">
            <button
              onClick={() => handleResolve('keepServer')}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
            >
              保留服务器版本
            </button>
            <button
              onClick={() => handleResolve('keepLocal')}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              保留本地版本
            </button>
            <button
              onClick={() => {
                setShowMergePreview(!showMergePreview)
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
            >
              {showMergePreview ? '隐藏预览' : '智能合并预览'}
            </button>
          </div>

          {/* 智能合并预览 */}
          {showMergePreview && currentConflict && (
            <div className="mt-4 p-3 bg-purple-50 border border-purple-100 rounded-xl">
              <h4 className="font-medium text-purple-800 mb-2">智能合并预览</h4>
              <pre className="text-xs text-purple-700 whitespace-pre-wrap max-h-32 overflow-y-auto">
                {JSON.stringify(previewMerge(), null, 2)}
              </pre>
              <button
                onClick={() => handleResolve('merge')}
                className="mt-3 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
              >
                确认合并
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ConflictResolutionModal
