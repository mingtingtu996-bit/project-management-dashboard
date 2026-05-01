import { useState } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { ConflictItem, ResolutionStrategy, smartMerge, getFieldDifference } from '@/hooks/useConflictDetection'
import { Button } from '@/components/ui/button'

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
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) onClose()
    }}>
      <DialogContent
        closeLabel="关闭冲突解决弹窗"
        className="max-h-[80vh] max-w-3xl overflow-hidden border-slate-200 p-0"
      >
        <DialogHeader className="bg-amber-50 px-6 py-4 pr-16">
          <DialogTitle className="text-lg font-semibold text-amber-800">数据冲突检测</DialogTitle>
          <DialogDescription>
            检测到 {conflicts.length} 个冲突，请选择解决方案
          </DialogDescription>
          <p className="text-sm text-amber-600">
            检测到 {conflicts.length} 个冲突，请选择解决方案
          </p>
        </DialogHeader>
        <Separator />

        {/* 冲突列表（如果有多个） */}
        {conflicts.length > 1 && (
          <>
            <div className="px-6 py-3">
              <div className="flex flex-wrap gap-2">
                {conflicts.map((conflict, index) => (
                  <Button variant="ghost"
                    key={conflict.entityId}
                    onClick={() => setSelectedEntity(conflict.entityId)}
                    className={`px-3 py-1 text-sm rounded-full transition-colors ${
                      (selectedEntity || conflicts[0].entityId) === conflict.entityId
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {entityTypeLabels[conflict.entityType]} {index + 1}
                  </Button>
                ))}
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* 冲突详情 */}
        <div className="p-6 overflow-y-auto max-h-[40vh]">
          {currentConflict && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="px-2 py-0.5 bg-slate-100 rounded">
                  {entityTypeLabels[currentConflict.entityType]}
                </span>
                <span>版本 {currentConflict.localVersion} → {currentConflict.serverVersion}</span>
              </div>

              {/* 冲突字段列表 */}
              <div className="space-y-2">
                <h4 className="font-medium text-slate-700">冲突字段：</h4>
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
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <h4 className="font-medium text-emerald-800 mb-2">服务器版本</h4>
                  <pre className="text-xs text-emerald-700 whitespace-pre-wrap">
                    {JSON.stringify(currentConflict.serverData, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <Separator />
        <div className="px-6 py-4 bg-slate-50">
          <div className="flex flex-wrap gap-3 justify-end">
            <Button variant="ghost"
              onClick={() => handleResolve('keepServer')}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
            >
              保留服务器版本
            </Button>
            <Button variant="ghost"
              onClick={() => handleResolve('keepLocal')}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              保留本地版本
            </Button>
            <Button variant="ghost"
              onClick={() => {
                setShowMergePreview(!showMergePreview)
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              {showMergePreview ? '隐藏预览' : '智能合并预览'}
            </Button>
          </div>

          {/* 智能合并预览 */}
          {showMergePreview && currentConflict && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-xl">
              <h4 className="font-medium text-blue-800 mb-2">智能合并预览</h4>
              <pre className="text-xs text-blue-700 whitespace-pre-wrap max-h-32 overflow-y-auto">
                {JSON.stringify(previewMerge(), null, 2)}
              </pre>
              <Button variant="ghost"
                onClick={() => handleResolve('merge')}
                className="mt-3 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                确认合并
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ConflictResolutionModal
