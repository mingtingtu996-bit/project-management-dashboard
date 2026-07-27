// v1.4.7.1: Inline popover for mid-complexity business actions
// Appears below a row, handles quick blockage registration + condition management

import { memo, useState, useCallback, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Badge as UIBadge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { AlertCircle, Plus, X } from 'lucide-react'

// ============================================================
// Quick Blockage Registration (v1.4.8 §2.3 aligned)
// ============================================================
export interface QuickBlockageFormProps {
  onSubmit: (data: { description: string; severity: string; expectedResolution?: string }) => void
  onCancel: () => void
  className?: string
}

export const QuickBlockageForm = memo(function QuickBlockageForm(props: QuickBlockageFormProps) {
  const { onSubmit, onCancel, className } = props
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState('中')
  const [expectedResolution, setExpectedResolution] = useState('')
  const descriptionId = useId()

  const handleSubmit = useCallback(() => {
    if (!description.trim()) return
    onSubmit({
      description: description.trim(),
      severity,
      expectedResolution: expectedResolution.trim(),
    })
  }, [description, severity, expectedResolution, onSubmit])

  return (
    <div className={cn('space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-[var(--el-2)]', className)} data-testid="quick-blockage-form">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-medium text-slate-900">快速登记阻碍</span>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-600" htmlFor={descriptionId}>阻碍描述</label>
        <Input
          id={descriptionId}
          placeholder="阻碍描述"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="h-8 text-sm"
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          autoFocus
        />
        <div className="flex gap-2">
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger aria-label="阻碍严重度" className="h-8 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="高" className="text-xs">高</SelectItem>
              <SelectItem value="中" className="text-xs">中</SelectItem>
              <SelectItem value="低" className="text-xs">低</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            aria-label="预计解除日期，可选"
            value={expectedResolution}
            onChange={(e) => setExpectedResolution(e.target.value)}
            className="h-8 flex-1 text-xs"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>取消</Button>
        <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={!description.trim()}>登记</Button>
      </div>
    </div>
  )
})

// ============================================================
// Inline Condition Management (v1.4.8 §2.2 aligned)
// ============================================================
export interface ConditionItem {
  id: string
  name: string
  type: 'hard' | 'soft'
  isSatisfied: boolean
  satisfiedAt?: string
  sourceDescription?: string // e.g. "图纸 G-01 已通过审核"
}

export interface InlineConditionListProps {
  conditions: ConditionItem[]
  onToggleSatisfied?: (conditionId: string) => void
  onAddCondition?: () => void
  onOpenDrawer?: () => void
  className?: string
}

export const InlineConditionList = memo(function InlineConditionList(props: InlineConditionListProps) {
  const { conditions, onToggleSatisfied, onAddCondition, onOpenDrawer, className } = props

  const hardCount = conditions.filter((c) => c.type === 'hard').length
  const softCount = conditions.filter((c) => c.type === 'soft').length
  const satisfiedCount = conditions.filter((c) => c.isSatisfied).length
  const allSatisfied = satisfiedCount === conditions.length

  return (
    <div className={cn('space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-[var(--el-2)]', className)} data-testid="inline-condition-list">
      <div className="flex items-center gap-2">
        <span className={cn('text-sm font-medium', allSatisfied ? 'text-emerald-700' : 'text-slate-900')}>
          开工条件
        </span>
        <span className="text-xs text-slate-400">
          {allSatisfied ? '全部满足' : `硬 ${hardCount} 软 ${softCount} · 已满足 ${satisfiedCount}/${conditions.length}`}
        </span>
      </div>

      {conditions.length === 0 ? (
        <p className="text-xs text-slate-400">暂无开工条件</p>
      ) : (
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {conditions.map((condition) => (
            <div
              key={condition.id}
              className={cn(
                'flex items-center gap-2 rounded-lg px-2 py-1.5',
                condition.isSatisfied ? 'bg-emerald-50' : condition.type === 'hard' ? 'bg-amber-50' : 'bg-slate-50',
              )}
            >
              <UIBadge variant="outline" className={cn(
                'shrink-0 px-1 py-0 text-xs',
                condition.type === 'hard' ? 'border-amber-300 text-amber-700' : 'border-blue-300 text-blue-700',
              )}>
                {condition.type === 'hard' ? '硬' : '软'}
              </UIBadge>
              <span className="flex-1 truncate text-xs text-slate-700">{condition.name}</span>
              {condition.type === 'soft' && !condition.isSatisfied && onToggleSatisfied && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 text-xs text-emerald-600 hover:text-emerald-700"
                  onClick={() => onToggleSatisfied(condition.id)}
                >
                  满足
                </Button>
              )}
              {condition.isSatisfied && (
                <span className="shrink-0 text-xs text-emerald-600">
                  {condition.satisfiedAt ? `已满足 ${condition.satisfiedAt.slice(0, 10)}` : '已满足'}
                </span>
              )}
              {condition.type === 'hard' && !condition.isSatisfied && condition.sourceDescription && (
                <span className="shrink-0 text-xs text-slate-400">{condition.sourceDescription}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        {onAddCondition && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onAddCondition} data-testid="inline-add-condition">
            <Plus className="h-3 w-3" />
            新增条件
          </Button>
        )}
        {onOpenDrawer && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-slate-500" onClick={onOpenDrawer}>
            打开任务详情查看更多
          </Button>
        )}
      </div>
    </div>
  )
})

export default QuickBlockageForm
