// v1.4.7.1 §10.9: Milestone level picker
// Minimal picker for marking/unmarking milestones with level selection

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { Star, StarOff } from 'lucide-react'

export type MilestoneLevel = 1 | 2 | 3

const LEVEL_LABELS: Record<MilestoneLevel, string> = {
  1: '一级 · 关键节点，影响整体工期',
  2: '二级 · 重要节点，分项关键控制点',
  3: '三级 · 一般节点，过程监控点',
}

export interface MilestonePickerProps {
  isMilestone: boolean
  level?: MilestoneLevel | null
  onMark: (level: MilestoneLevel) => void
  onUnmark: () => void
  className?: string
}

export const MilestonePicker = memo(function MilestonePicker(props: MilestonePickerProps) {
  const { isMilestone, level, onMark, onUnmark, className } = props

  if (isMilestone) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={cn('gap-1 text-xs text-amber-600', className)}
        onClick={onUnmark}
        title="取消里程碑标记"
      >
        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
        {level ? `${LEVEL_LABELS[level].split('·')[0].trim()}` : '里程碑'}
        <StarOff className="ml-1 h-3 w-3 text-slate-400" />
      </Button>
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('gap-1 text-xs text-slate-500 hover:text-amber-600', className)}
          title="标记为里程碑"
        >
          <Star className="h-3.5 w-3.5" />
          标记里程碑
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <div className="space-y-1">
          {([1, 2, 3] as MilestoneLevel[]).map((lvl) => (
            <Button unstyled
              key={lvl}
              type="button"
              className={cn(
                'flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-amber-50',
                lvl === 1 && 'hover:bg-amber-100',
              )}
              onClick={() => onMark(lvl)}
            >
              <Star className={cn(
                'mt-0.5 h-3.5 w-3.5 shrink-0',
                lvl === 1 ? 'text-amber-500' : lvl === 2 ? 'text-amber-400' : 'text-slate-400',
              )} />
              <div>
                <p className="text-xs font-medium text-slate-900">{LEVEL_LABELS[lvl].split('·')[0].trim()}</p>
                <p className="text-xs text-slate-500">{LEVEL_LABELS[lvl].split('·')[1]?.trim()}</p>
              </div>
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
})

export default MilestonePicker
