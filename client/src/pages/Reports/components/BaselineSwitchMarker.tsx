import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export interface BaselineSwitchEvent {
  switch_date: string
  from_version: string
  to_version: string
  explanation: string
}

export function BaselineSwitchMarker({
  events,
  baselineLabel,
}: {
  events: BaselineSwitchEvent[]
  baselineLabel: string
}) {
  const firstEvent = events[0] ?? null

  return (
    <Card data-testid="baseline-switch-marker" className="border-blue-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">基线版本切换标记</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div data-testid="deviation-version-note" className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          版本切换说明：
          {firstEvent
            ? ` ${firstEvent.switch_date} ${firstEvent.from_version} → ${firstEvent.to_version}，${firstEvent.explanation}`
            : ` 当前基线为 ${baselineLabel}，暂无可视化切换事件。`}
        </div>
        <div className="space-y-2">
          {events.length > 0 ? (
            events.map((event) => (
              <div key={`${event.switch_date}-${event.from_version}-${event.to_version}`} className="rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-700">
                <div className="font-medium text-slate-900">
                  {event.switch_date}：{event.from_version} → {event.to_version}
                </div>
                <div className="mt-1 leading-6 text-slate-600">{event.explanation}</div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              暂无版本切换事件
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
