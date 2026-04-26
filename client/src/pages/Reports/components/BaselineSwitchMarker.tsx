import { useState } from 'react'
import { Button } from '@/components/ui/button'
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
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(
    firstEvent ? `${firstEvent.switch_date}-${firstEvent.from_version}-${firstEvent.to_version}` : null,
  )
  const selectedEvent =
    events.find((event) => `${event.switch_date}-${event.from_version}-${event.to_version}` === selectedEventKey) ?? firstEvent
  const selectedEventKeyValue = selectedEvent
    ? `${selectedEvent.switch_date}-${selectedEvent.from_version}-${selectedEvent.to_version}`
    : null

  return (
    <Card data-testid="baseline-switch-marker" className="border-blue-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">基线版本切换标记</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {selectedEvent ? (
          <div data-testid="deviation-version-note" className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="font-medium">
                {selectedEvent.switch_date} {selectedEvent.from_version} → {selectedEvent.to_version}
              </div>
              <div className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700">
                当前基线 {baselineLabel}
              </div>
            </div>
            <div className="mt-2">{selectedEvent.explanation}</div>
            <div className="mt-2 text-xs text-blue-700">
              切换记录 {events.length} 条 · 点击下方事件可切换详情
            </div>
          </div>
        ) : (
          <div data-testid="deviation-version-note" className="rounded-2xl border border-blue-100 bg-blue-50 p-4" />
        )}
        <div className="space-y-2">
          {events.length > 0 ? (
            events.map((event) => (
              <button
                key={`${event.switch_date}-${event.from_version}-${event.to_version}`}
                type="button"
                onClick={() => setSelectedEventKey(`${event.switch_date}-${event.from_version}-${event.to_version}`)}
                className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${
                  selectedEventKeyValue === `${event.switch_date}-${event.from_version}-${event.to_version}`
                    ? 'border-blue-200 bg-blue-50 text-blue-900'
                    : 'border-slate-100 bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="font-medium text-slate-900">
                  {event.switch_date}：{event.from_version} → {event.to_version}
                </div>
                <div className="mt-1 leading-6 text-slate-600">{event.explanation}</div>
              </button>
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
