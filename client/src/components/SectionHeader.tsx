import type { ReactNode } from 'react'

interface Props {
  title: string
  eyebrow?: string
  action?: ReactNode
  count?: number
}

export function SectionHeader({ title, eyebrow, action, count }: Props) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h3 className="text-lg font-semibold text-slate-900">
          {title}
          {count != null && (
            <span className="ml-2 text-sm font-normal text-slate-500">({count})</span>
          )}
        </h3>
      </div>
      {action}
    </div>
  )
}
