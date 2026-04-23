import { cn } from '@/lib/utils'

export interface TimelineScaleSegment {
  key: string
  left: number
  width: number
  label: string
  hint?: string | null
}

interface TimelineScaleHeaderProps {
  segments: TimelineScaleSegment[]
  timelineWidth: number
  scrollLeft: number
  todayX: number | null
}

export function TimelineScaleHeader({
  segments,
  timelineWidth,
  scrollLeft,
  todayX,
}: TimelineScaleHeaderProps) {
  return (
    <div className="overflow-hidden border-b border-slate-200 bg-slate-50">
      <div
        className="relative h-14"
        style={{
          width: timelineWidth,
          transform: `translateX(-${scrollLeft}px)`,
          transformOrigin: 'left center',
        }}
      >
        {segments.map((segment, index) => (
          <div
            key={segment.key}
            className={cn(
              'absolute inset-y-0 border-r border-slate-200 px-2 py-2 text-slate-600',
              index % 2 === 0 ? 'bg-slate-50' : 'bg-white/70',
            )}
            style={{ left: segment.left, width: segment.width }}
          >
            <div className="truncate text-xs font-semibold text-slate-900">{segment.label}</div>
            {segment.hint ? <div className="truncate pt-1 text-[11px] text-slate-500">{segment.hint}</div> : null}
          </div>
        ))}
        {todayX !== null ? (
          <>
            <div className="absolute inset-y-0 w-px bg-rose-400/80" style={{ left: todayX }} />
            <div
              className="absolute top-1 -translate-x-1/2 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
              style={{ left: todayX }}
            >
              今天
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
