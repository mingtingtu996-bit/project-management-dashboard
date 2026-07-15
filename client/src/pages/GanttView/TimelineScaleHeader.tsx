import { Separator } from '@/components/ui/separator'
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
    <>
      <div className="overflow-hidden bg-slate-50">
        <div
          className="relative h-14"
          style={{
            width: timelineWidth,
            transform: `translateX(-${scrollLeft}px)`,
            transformOrigin: 'left center',
          }}
        >
          {segments.map((segment, index) => {
            const isNarrow = segment.width < 36
            const compactLabel = isNarrow && segment.label.includes('/')
              ? segment.label.split('/').at(-1) || segment.label
              : segment.label

            return (
              <div
                key={segment.key}
                className={cn(
                  'absolute inset-y-0 border-r border-slate-200 text-slate-600',
                  isNarrow ? 'px-0.5 py-1 text-center' : 'px-2 py-2',
                  index % 2 === 0 ? 'bg-slate-50' : 'bg-white/70',
                )}
                style={{ left: segment.left, width: segment.width }}
                title={segment.hint ? `${segment.label} ${segment.hint}` : segment.label}
              >
                <div className={cn(
                  'truncate font-semibold text-slate-900',
                  isNarrow ? 'timeline-scale-label-narrow' : 'text-xs',
                )}>
                  {compactLabel}
                </div>
                {segment.hint ? (
                  <div className={cn(
                    'truncate text-slate-500',
                    isNarrow ? 'timeline-scale-hint-narrow pt-0' : 'pt-1 text-xs',
                  )}>
                    {segment.hint}
                  </div>
                ) : null}
              </div>
            )
          })}
          {todayX !== null ? (
            <>
              <div className="absolute inset-y-0 w-px bg-rose-400/80" style={{ left: todayX }} />
              <div
                className="absolute top-1 -translate-x-1/2 rounded-full bg-rose-500 px-2 py-0.5 text-xs font-semibold text-white shadow-[var(--el-1)]"
                style={{ left: todayX }}
              >
                今天
              </div>
            </>
          ) : null}
        </div>
      </div>
      <Separator />
    </>
  )
}
