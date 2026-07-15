import { memo, useMemo, useState } from 'react'
import { Boxes, Plus, ShieldAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface EngineeringObjectLookupOption {
  id: string
  objectName: string
  objectCode?: string | null
  objectType?: string | null
}

export interface EngineeringObjectLookupProps {
  valueId?: string | null
  options: EngineeringObjectLookupOption[]
  disabled?: boolean
  canCreate?: boolean
  onChange: (objectId: string | null, option?: EngineeringObjectLookupOption | null) => void
  onCreate?: (query: string) => void
  className?: string
}

export const EngineeringObjectLookup = memo(function EngineeringObjectLookup({
  valueId,
  options,
  disabled,
  canCreate,
  onChange,
  onCreate,
  className,
}: EngineeringObjectLookupProps) {
  const [query, setQuery] = useState('')
  const selected = options.find((option) => option.id === valueId) ?? null
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = useMemo(() => (
    normalizedQuery
      ? options.filter((option) => (
          option.objectName.toLowerCase().includes(normalizedQuery)
          || String(option.objectCode ?? '').toLowerCase().includes(normalizedQuery)
          || String(option.objectType ?? '').toLowerCase().includes(normalizedQuery)
        ))
      : options
  ), [normalizedQuery, options])

  return (
    <div data-testid="engineering-object-lookup" className={cn('space-y-2 rounded-xl border border-slate-200 bg-white p-3', className)}>
      <div className="flex items-center gap-2">
        <Boxes className="h-4 w-4 text-slate-500" />
        <Input
          value={query}
          disabled={disabled}
          placeholder={selected?.objectName ?? '搜索工程对象'}
          className="h-8 text-sm"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="max-h-44 space-y-1 overflow-y-auto">
        {filtered.map((option) => (
          <Button unstyled
            key={option.id}
            type="button"
            disabled={disabled}
            data-selected={option.id === valueId ? 'true' : 'false'}
            className={cn(
              'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
              option.id === valueId ? 'bg-blue-50 text-blue-800' : 'hover:bg-slate-50',
              disabled && 'cursor-not-allowed opacity-60',
            )}
            onClick={() => onChange(option.id, option)}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{option.objectName}</span>
              {option.objectCode ? <span className="block truncate text-xs text-slate-400">{option.objectCode}</span> : null}
            </span>
            {option.objectType ? <span className="shrink-0 text-xs text-slate-400">{option.objectType}</span> : null}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {canCreate && onCreate ? (
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-0 text-xs" onClick={() => onCreate(query.trim())}>
              <Plus className="h-3.5 w-3.5" />
              跳转新增工程对象
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1">
              <ShieldAlert className="h-3.5 w-3.5" />
              未找到工程对象，请联系管理员维护主数据
            </span>
          )}
        </div>
      ) : null}
    </div>
  )
})

export default EngineeringObjectLookup
