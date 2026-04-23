import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

interface LoadingStateProps {
  label: string
  description?: string
  className?: string
}

export function LoadingState({ label, description, className }: LoadingStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-32 flex-col items-center justify-center rounded-card border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center text-sm text-slate-500',
        className,
      )}
    >
      <Loader2 className="h-5 w-5 animate-spin text-blue-500 motion-reduce:animate-none" />
      <p className="mt-3 font-medium text-slate-700">{label}</p>
      {description ? <p className="mt-1 text-xs text-slate-400">{description}</p> : null}
    </div>
  )
}

export default LoadingState
