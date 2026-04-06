/**
 * BatchActionBar — 批量操作浮动条（I02）
 *
 * 多选后底部浮出操作栏，提供删除、状态变更、导出等操作。
 * 动画：从底部滑入/滑出（CSS transition）
 *
 * 使用示例：
 * <BatchActionBar
 *   selectedCount={selected.length}
 *   onClear={() => setSelected([])}
 *   actions={[
 *     { label: '删除', icon: Trash2, variant: 'destructive', onClick: handleDelete },
 *     { label: '标记完成', icon: CheckCircle, onClick: handleComplete },
 *     { label: '导出 CSV', icon: Download, onClick: handleExport },
 *   ]}
 * />
 */
import { X } from 'lucide-react'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface BatchAction {
  label: string
  icon?: LucideIcon
  /** 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' */
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost'
  onClick: () => void
  disabled?: boolean
}

interface BatchActionBarProps {
  /** 已选中数量 */
  selectedCount: number
  /** 清空选择 */
  onClear: () => void
  /** 操作按钮列表 */
  actions: BatchAction[]
  /** 额外 className */
  className?: string
}

export function BatchActionBar({ selectedCount, onClear, actions, className }: BatchActionBarProps) {
  const visible = selectedCount > 0

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300',
        visible ? 'translate-y-0' : 'translate-y-full',
        className
      )}
      aria-live="polite"
    >
      <div className="mx-auto max-w-[1440px] px-4 lg:px-6 pb-4">
        <div className="flex items-center justify-between gap-4 rounded-xl bg-gray-900 px-4 py-3 shadow-xl text-white">
          {/* 左侧：已选中数量 */}
          <div className="flex items-center gap-3">
            <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-bold">
              {selectedCount}
            </span>
            <span className="text-sm font-medium">条已选中</span>
            <button
              onClick={onClear}
              className="ml-1 rounded-md p-1 hover:bg-gray-700 transition-colors"
              aria-label="清空选择"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          </div>

          {/* 右侧：操作按钮组 */}
          <div className="flex items-center gap-2">
            {actions.map((action, idx) => (
              <Button
                key={idx}
                size="sm"
                variant={action.variant ?? 'outline'}
                onClick={action.onClick}
                disabled={action.disabled}
                className={cn(
                  'gap-1.5 text-sm',
                  action.variant === 'destructive'
                    ? 'bg-red-600 hover:bg-red-700 text-white border-red-600'
                    : action.variant === 'outline'
                    ? 'border-gray-600 text-gray-200 hover:bg-gray-700 hover:text-white'
                    : ''
                )}
              >
                {action.icon && <action.icon className="h-4 w-4" />}
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
