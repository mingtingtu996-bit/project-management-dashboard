// v1.4.7.1 §10.3-10.4: Drawer section renderers for blockages and conditions
// Used as renderBlockages / renderConditions props on PlanningDetailDrawer

import { memo, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle2, Plus, ShieldCheck, X } from 'lucide-react'

// ============================================================
// Blockage drawer section (§10.3)
// ============================================================
export interface BlockageRecord {
  id: string
  description: string
  severity: 'high' | 'medium' | 'low'
  status: 'active' | 'resolved'
  createdAt: string
  expectedResolutionDate?: string | null
  resolvedAt?: string
}

export interface BlockageDrawerSectionProps {
  blockages: BlockageRecord[]
  canEdit?: boolean
  onAddBlockage?: (data: { description: string; severity: string; expectedResolutionDate: string }) => void | Promise<void>
  onResolveBlockage?: (id: string) => void
  onViewObstaclePage?: () => void
  className?: string
}

const SEVERITY_LABELS: Record<string, string> = { high: '高', medium: '中', low: '低' }
const SEVERITY_COLORS: Record<string, string> = {
  high: 'border-red-200 bg-red-50 text-red-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  low: 'border-slate-200 bg-slate-50 text-slate-600',
}

export const BlockageDrawerSection = memo(function BlockageDrawerSection(props: BlockageDrawerSectionProps) {
  const { blockages, canEdit, onAddBlockage, onResolveBlockage, onViewObstaclePage, className } = props
  const [showForm, setShowForm] = useState(false)
  const [newDesc, setNewDesc] = useState('')
  const [newSeverity, setNewSeverity] = useState('medium')
  const [newExpectedResolutionDate, setNewExpectedResolutionDate] = useState('')

  const handleAdd = useCallback(() => {
    if (!newDesc.trim() || !newExpectedResolutionDate) return
    void onAddBlockage?.({
      description: newDesc.trim(),
      severity: newSeverity,
      expectedResolutionDate: newExpectedResolutionDate,
    })
    setNewDesc('')
    setNewSeverity('medium')
    setNewExpectedResolutionDate('')
    setShowForm(false)
  }, [newDesc, newExpectedResolutionDate, newSeverity, onAddBlockage])

  const activeBlockages = blockages.filter(b => b.status === 'active')
  const resolvedBlockages = blockages.filter(b => b.status === 'resolved')

  return (
    <div className={cn('space-y-3', className)}>
      {/* Add form */}
      {canEdit && showForm && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <Input placeholder="阻碍描述" value={newDesc} onChange={e => setNewDesc(e.target.value)} className="h-8 text-sm" autoFocus />
          <div className="flex items-center gap-2">
            <Select value={newSeverity} onValueChange={setNewSeverity}>
              <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="high" className="text-xs">高</SelectItem>
                <SelectItem value="medium" className="text-xs">中</SelectItem>
                <SelectItem value="low" className="text-xs">低</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              aria-label="预计解除日期"
              value={newExpectedResolutionDate}
              onChange={e => setNewExpectedResolutionDate(e.target.value)}
              className="h-8 w-36 text-xs"
            />
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={handleAdd}
              disabled={!newDesc.trim() || !newExpectedResolutionDate}
            >
              登记
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setShowForm(false)
                setNewExpectedResolutionDate('')
              }}
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {/* Active blockages */}
      {activeBlockages.length === 0 && resolvedBlockages.length === 0 ? (
        <div className="py-4 text-center">
          <p className="text-sm text-slate-400">暂无阻碍记录</p>
          {canEdit && (
            <Button variant="ghost" size="sm" className="mt-2 gap-1 text-xs" onClick={() => setShowForm(true)}>
              <Plus className="h-3 w-3" />登记阻碍
            </Button>
          )}
        </div>
      ) : (
        <>
          {activeBlockages.map(b => (
            <div key={b.id} className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-900">{b.description}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <Badge variant="outline" className={cn('px-1 py-0 text-xs', SEVERITY_COLORS[b.severity])}>{SEVERITY_LABELS[b.severity]}</Badge>
                  <span>{b.createdAt.slice(0, 10)}</span>
                  {b.expectedResolutionDate ? <span>预计 {b.expectedResolutionDate.slice(0, 10)} 解除</span> : null}
                </div>
              </div>
              {canEdit && onResolveBlockage && (
                <Button variant="ghost" size="sm" className="h-7 shrink-0 text-xs text-emerald-600" onClick={() => onResolveBlockage(b.id)}>
                  <CheckCircle2 className="mr-1 h-3 w-3" />解决
                </Button>
              )}
            </div>
          ))}

          {/* Resolved blockages (collapsed) */}
          {resolvedBlockages.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer py-1 text-xs text-slate-400 hover:text-slate-600">
                已解决 ({resolvedBlockages.length})
              </summary>
              <div className="mt-2 space-y-2">
                {resolvedBlockages.map(b => (
                  <div key={b.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-500">
                    {b.description} · 解决于 {b.resolvedAt?.slice(0, 10) ?? '--'}
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {/* Footer actions */}
      <div className="flex items-center gap-2">
        {canEdit && !showForm && activeBlockages.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setShowForm(true)}>
            <Plus className="h-3 w-3" />新登记阻碍
          </Button>
        )}
        {onViewObstaclePage && (
          <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-500" onClick={onViewObstaclePage}>
            查看阻碍专项台账
          </Button>
        )}
      </div>
    </div>
  )
})

// ============================================================
// Condition drawer section (§10.4)
// ============================================================
export interface ConditionRecord {
  id: string
  name: string
  type: 'hard' | 'soft'
  isSatisfied: boolean
  satisfiedAt?: string
  sourceDescription?: string
}

export interface ConditionDrawerSectionProps {
  conditions: ConditionRecord[]
  canEdit?: boolean
  onToggleSatisfied?: (id: string) => void
  onAddCondition?: () => void
  onDeleteCondition?: (id: string) => void
  onLoadFromTemplate?: () => void
  className?: string
}

export const ConditionDrawerSection = memo(function ConditionDrawerSection(props: ConditionDrawerSectionProps) {
  const { conditions, canEdit, onToggleSatisfied, onAddCondition, onDeleteCondition, onLoadFromTemplate, className } = props

  const hardConditions = conditions.filter(c => c.type === 'hard')
  const softConditions = conditions.filter(c => c.type === 'soft')
  const satisfiedCount = conditions.filter(c => c.isSatisfied).length

  return (
    <div className={cn('space-y-3', className)}>
      {/* Summary */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <ShieldCheck className="h-4 w-4" />
        <span>硬 {hardConditions.length} / 软 {softConditions.length}</span>
        <span className="text-slate-300">·</span>
        <span>已满足 {satisfiedCount}/{conditions.length}</span>
      </div>

      {/* Hard conditions */}
      {hardConditions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-500">硬条件（系统判定）</p>
          {hardConditions.map(c => (
            <div key={c.id} className={cn('flex items-center gap-2 rounded-lg px-3 py-2', c.isSatisfied ? 'bg-emerald-50' : 'bg-amber-50')}>
              <Badge variant="outline" className={cn('shrink-0 px-1 py-0 text-xs', c.isSatisfied ? 'border-emerald-300 text-emerald-700' : 'border-amber-300 text-amber-700')}>硬</Badge>
              <span className="flex-1 text-sm text-slate-700">{c.name}</span>
              {c.isSatisfied ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : c.sourceDescription ? (
                <span className="text-xs text-slate-400">{c.sourceDescription}</span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Soft conditions */}
      {softConditions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-500">软条件（可手工确认）</p>
          {softConditions.map(c => (
            <div key={c.id} className={cn('flex items-center gap-2 rounded-lg px-3 py-2', c.isSatisfied ? 'bg-emerald-50' : 'bg-slate-50')}>
              <Badge variant="outline" className="shrink-0 border-blue-200 bg-blue-50 px-1 py-0 text-xs text-blue-700">软</Badge>
              <span className="flex-1 text-sm text-slate-700">{c.name}</span>
              {c.isSatisfied ? (
                <span className="text-xs text-emerald-600">已确认 {c.satisfiedAt?.slice(0, 10)}</span>
              ) : canEdit && onToggleSatisfied ? (
                <Button variant="ghost" size="sm" className="h-6 text-xs text-emerald-600" onClick={() => onToggleSatisfied(c.id)}>
                  确认满足
                </Button>
              ) : null}
              {canEdit && onDeleteCondition && (
                <Button variant="ghost" size="sm" className="h-6 text-xs text-slate-400" onClick={() => onDeleteCondition(c.id)}>
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {conditions.length === 0 && (
        <p className="py-2 text-sm text-slate-400">暂无开工条件</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {canEdit && onAddCondition && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onAddCondition}>
            <Plus className="h-3 w-3" />新增条件
          </Button>
        )}
        {canEdit && onLoadFromTemplate && conditions.length === 0 && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onLoadFromTemplate}>
            从模板批量挂载
          </Button>
        )}
      </div>
    </div>
  )
})

export default BlockageDrawerSection
