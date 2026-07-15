import { Group } from 'lucide-react'
import type { GroupMode } from '@/hooks/useGroupMode'
import { Button } from '@/components/ui/button'

interface Props {
  groupMode: GroupMode
  onChange: (mode: GroupMode) => void
}

export function GroupModeToggle({ groupMode, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-1 text-xs">
      <Group className="h-3.5 w-3.5 text-slate-400" />
      <span className="mr-1 text-slate-400">分组</span>
      <Button unstyled
        type="button"
        data-testid="planning-group-mode-execution"
        aria-pressed={groupMode === 'execution'}
        onClick={() => onChange('execution')}
        className={`rounded px-2 py-0.5 transition-colors ${
          groupMode === 'execution' ? 'bg-blue-100 font-medium text-blue-700' : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        按执行
      </Button>
      <Button unstyled
        type="button"
        data-testid="planning-group-mode-spatial"
        aria-pressed={groupMode === 'spatial'}
        onClick={() => onChange('spatial')}
        className={`rounded px-2 py-0.5 transition-colors ${
          groupMode === 'spatial' ? 'bg-blue-100 font-medium text-blue-700' : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        按空间
      </Button>
    </div>
  )
}
