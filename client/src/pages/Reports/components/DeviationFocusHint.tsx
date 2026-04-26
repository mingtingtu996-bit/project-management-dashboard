import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

import type { DeviationView } from './DeviationTabs'

const viewLabels: Record<DeviationView, string> = {
  baseline: '基线偏差',
  monthly: '月度兑现偏差',
  execution: '执行偏差',
}

export function DeviationFocusHint({
  activeView,
  defaultView,
  secondaryExpanded,
  onToggleSecondaryExpanded,
}: {
  activeView: DeviationView
  defaultView: DeviationView
  secondaryExpanded: boolean
  onToggleSecondaryExpanded: () => void
}) {
  const defaultLabel = viewLabels[defaultView]
  const activeLabel = viewLabels[activeView]
  void activeLabel

  return (
    <Card data-testid="deviation-focus-hint" className="border-slate-200 shadow-sm">
      <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            主次引导
          </div>
          <div className="text-sm font-semibold text-slate-900">默认主线：{defaultLabel}</div>
        </div>
        <Button type="button" variant="outline" onClick={onToggleSecondaryExpanded}>
          {secondaryExpanded ? '收起其他视角摘要' : '展开其他视角摘要'}
        </Button>
      </CardContent>
    </Card>
  )
}

export { viewLabels }
