import { Button } from '@/components/ui/button'

export type DeviationView = 'baseline' | 'monthly' | 'execution'

const tabs: Array<{ value: DeviationView; label: string; helper: string }> = [
  { value: 'baseline', label: '基线偏差', helper: '基线对比' },
  { value: 'monthly', label: '月度兑现偏差', helper: '月度计划兑现' },
  { value: 'execution', label: '执行偏差', helper: '计划执行' },
]

export function DeviationTabs({
  value,
  onValueChange,
}: {
  value: DeviationView
  onValueChange: (value: DeviationView) => void
}) {
  return (
    <div
      data-testid="deviation-tabs"
      className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
      role="tablist"
      aria-label="三视角切换"
    >
      <div className="grid gap-2 md:grid-cols-3">
        {tabs.map((tab) => {
          const active = tab.value === value

          return (
            <Button
              key={tab.value}
              type="button"
              variant={active ? 'default' : 'outline'}
              className="h-auto flex-col items-start justify-start gap-1 rounded-xl px-4 py-3 text-left"
              data-state={active ? 'active' : 'inactive'}
              aria-pressed={active}
              onClick={() => onValueChange(tab.value)}
            >
              <span className="text-xs font-medium uppercase tracking-[0.12em] opacity-70">{tab.helper}</span>
              <span className="text-sm font-semibold">{tab.label}</span>
            </Button>
          )
        })}
      </div>
    </div>
  )
}
