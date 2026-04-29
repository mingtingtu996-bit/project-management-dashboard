import type { ReactNode } from 'react'

interface Props {
  title: string
  action?: ReactNode
  count?: number
}

export function SectionHeader({ title, action, count }: Props) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold text-slate-900">
        {title}
        {count != null && (
          <span className="ml-2 text-sm font-normal text-slate-500">({count})</span>
        )}
      </h3>
      {action}
    </div>
  )
}
