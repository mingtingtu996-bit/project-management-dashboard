import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface SegmentedControlProps {
  options: { value: string; label: string; disabled?: boolean; testId?: string }[]
  value: string
  onChange: (value: string) => void
  className?: string
  activeClassName?: string
  inactiveClassName?: string
}

export function SegmentedControl({ options, value, onChange, className, activeClassName, inactiveClassName }: SegmentedControlProps) {
  return (
    <div className={cn('meta-caption inline-flex rounded-lg bg-slate-100/70 p-0.5', className)}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <Button unstyled
            key={option.value}
            type="button"
            data-testid={option.testId}
            className={cn(
              'h-7 rounded-md px-2.5 text-xs font-medium outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
              option.disabled && 'cursor-not-allowed opacity-40',
              active
                ? cn('bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)]', activeClassName)
                : cn('text-slate-500 hover:text-slate-700', inactiveClassName),
            )}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}
