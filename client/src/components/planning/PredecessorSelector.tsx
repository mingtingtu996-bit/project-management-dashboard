// v1.4.7.1 §7.8: Predecessor search selector
// Inline popover for selecting predecessor tasks with cycle detection

import { memo, useMemo, useState } from 'react'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { PlanningPrecedingBadge } from '@/components/planning/PlanningPrecedingBadge'
import { cn } from '@/lib/utils'
import { Plus, Search, Settings2, X } from 'lucide-react'

type PredecessorDependencyType = 'FS' | 'SS' | 'FF' | 'SF'

export interface PredecessorScope {
  engineeringObjectId?: string | null
  buildingObjectId?: string | null
  physicalZoneObjectId?: string | null
  functionalAreaObjectId?: string | null
}

export interface PredecessorOption {
  id: string
  title: string
  wbsCode?: string
  dependencyType?: PredecessorDependencyType
  lagDays?: number
  engineeringObjectId?: string | null
  buildingObjectId?: string | null
  physicalZoneObjectId?: string | null
  functionalAreaObjectId?: string | null
}

export interface PredecessorSelectorProps {
  predecessors: PredecessorOption[]
  availableTasks?: PredecessorOption[]
  getAvailableTasks?: () => PredecessorOption[]
  currentScope?: PredecessorScope | null
  onAdd: (taskId: string, dependencyType?: PredecessorDependencyType, lagDays?: number) => void
  onRemove: (taskId: string) => void
  isCritical?: boolean
  disabled?: boolean
  className?: string
}

export const PredecessorSelector = memo(function PredecessorSelector(props: PredecessorSelectorProps) {
  const { predecessors, availableTasks: availableTasksProp, getAvailableTasks, currentScope, onAdd, onRemove, isCritical, disabled, className } = props
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [dependencyType, setDependencyType] = useState<PredecessorDependencyType>('FS')
  const [lagDays, setLagDays] = useState('0')

  const availableTasks = useMemo(() => {
    if (!open) return []
    return availableTasksProp ?? getAvailableTasks?.() ?? []
  }, [availableTasksProp, getAvailableTasks, open])

  const filtered = useMemo(() => {
    const lower = search.toLowerCase().trim()
    const predIds = new Set(predecessors.map(p => p.id))
    return availableTasks
      .filter(t => !predIds.has(t.id) && (!lower || t.title.toLowerCase().includes(lower) || (t.wbsCode ?? '').includes(lower)))
      .sort((a, b) => Number(isCrossScopeCandidate(currentScope, b)) - Number(isCrossScopeCandidate(currentScope, a)))
      .slice(0, 20)
  }, [search, availableTasks, predecessors, currentScope])

  if (disabled) {
    if (predecessors.length === 0) return null
    return (
      <PlanningPrecedingBadge
        count={predecessors.length}
        isCritical={isCritical}
        readonly
        className={className}
      />
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-6 px-0 text-xs',
            isCritical ? 'text-red-500 font-medium' : 'text-slate-500',
            className,
          )}
          data-testid="predecessor-selector-trigger"
        >
          <PlanningPrecedingBadge count={predecessors.length} isCritical={isCritical} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-72 p-0" data-testid="predecessor-selector-popover">
        {/* Search */}
        <div className="flex items-center gap-1 border-b border-slate-100 px-3 py-2">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <Input
            type="text"
            placeholder="搜索任务名称或序号..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
            autoFocus
          />
          {search && (
            <Button unstyled type="button" className="text-slate-400 hover:text-slate-600" onClick={() => setSearch('')}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Advanced options stay folded by default; the task-list commit still sends predecessor IDs only. */}
        <div className="border-b border-slate-100 px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-0 text-xs text-slate-500"
            data-testid="predecessor-selector-advanced-toggle"
            onClick={() => setAdvancedOpen((value) => !value)}
          >
            <Settings2 className="h-3 w-3" />
            高级
          </Button>
          {advancedOpen ? (
            <div className="mt-2 grid grid-cols-[1fr_5rem] gap-2" data-testid="predecessor-selector-advanced-panel">
              <Select value={dependencyType} onValueChange={(value) => setDependencyType(value as PredecessorDependencyType)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FS">FS 完成后开始</SelectItem>
                  <SelectItem value="SS">SS 同步开始</SelectItem>
                  <SelectItem value="FF">FF 同步完成</SelectItem>
                  <SelectItem value="SF">SF 开始后完成</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                value={lagDays}
                onChange={(event) => setLagDays(event.currentTarget.value)}
                className="h-8 text-xs"
                aria-label="滞后天数"
              />
            </div>
          ) : null}
          <p className="mt-1 text-xs leading-4 text-slate-400">
            跨范围仅作为候选提示，添加后才会成为前置关系。
          </p>
        </div>

        {/* Current predecessors */}
        {predecessors.length > 0 && (
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">当前前置</p>
            <div className="flex flex-wrap gap-1">
              {predecessors.map((pred) => (
                <Badge
                  key={pred.id}
                  variant="outline"
                  className="flex cursor-pointer items-center gap-1 px-1.5 py-0 text-xs hover:bg-rose-50"
                  onClick={() => onRemove(pred.id)}
                >
                  {pred.wbsCode && <span className="text-slate-400">{pred.wbsCode}</span>}
                  {pred.title.slice(0, 20)}
                  {isCrossScopeCandidate(currentScope, pred) ? (
                    <span className="rounded bg-blue-50 px-1 text-xs font-medium text-blue-600">跨范围</span>
                  ) : null}
                  <X className="h-2.5 w-2.5 text-slate-400" />
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Available tasks */}
        <div className="max-h-48 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">
              {search ? '未找到匹配任务' : '没有更多可用任务'}
            </p>
          ) : (
            filtered.map((task) => (
              <Button unstyled
                key={task.id}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-slate-50"
                onClick={() => onAdd(task.id, dependencyType, Number.parseInt(lagDays, 10) || 0)}
              >
                <Plus className="h-3 w-3 shrink-0 text-slate-400" />
                <span className="tabular-nums text-slate-400">{task.wbsCode ?? ''}</span>
                <span className="flex-1 truncate text-slate-700">{task.title}</span>
                {isCrossScopeCandidate(currentScope, task) ? (
                  <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-600">跨范围</span>
                ) : null}
              </Button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
})

export default PredecessorSelector

function normalizeScopeId(value: string | null | undefined) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function isCrossScopeCandidate(currentScope: PredecessorScope | null | undefined, option: PredecessorOption) {
  if (!currentScope) return false
  const scopePairs = [
    [currentScope.engineeringObjectId, option.engineeringObjectId],
    [currentScope.buildingObjectId, option.buildingObjectId],
    [currentScope.physicalZoneObjectId, option.physicalZoneObjectId],
    [currentScope.functionalAreaObjectId, option.functionalAreaObjectId],
  ] as const
  return scopePairs.some(([current, candidate]) => {
    const currentId = normalizeScopeId(current)
    const candidateId = normalizeScopeId(candidate)
    return Boolean(currentId && candidateId && currentId !== candidateId)
  })
}
