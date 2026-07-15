import { memo, useMemo, useState } from 'react'
import { Building2, Plus, ShieldAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface ParticipantUnitLookupOption {
  id: string
  unitName: string
  unitType?: string | null
}

export interface ParticipantUnitLookupProps {
  valueId?: string | null
  options: ParticipantUnitLookupOption[]
  disabled?: boolean
  canCreate?: boolean
  onChange: (unitId: string | null, option?: ParticipantUnitLookupOption | null) => void
  onCreate?: (query: string) => void
  className?: string
}

export const ParticipantUnitLookup = memo(function ParticipantUnitLookup({
  valueId,
  options,
  disabled,
  canCreate,
  onChange,
  onCreate,
  className,
}: ParticipantUnitLookupProps) {
  const [query, setQuery] = useState('')
  const selected = options.find((option) => option.id === valueId) ?? null
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = useMemo(() => (
    normalizedQuery
      ? options.filter((option) => (
          option.unitName.toLowerCase().includes(normalizedQuery)
          || String(option.unitType ?? '').toLowerCase().includes(normalizedQuery)
        ))
      : options
  ), [normalizedQuery, options])

  return (
    <div data-testid="participant-unit-lookup" className={cn('space-y-2 rounded-xl border border-slate-200 bg-white p-3', className)}>
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-slate-500" />
        <Input
          value={query}
          disabled={disabled}
          placeholder={selected?.unitName ?? '搜索责任单位'}
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
              'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
              option.id === valueId ? 'bg-blue-50 text-blue-800' : 'hover:bg-slate-50',
              disabled && 'cursor-not-allowed opacity-60',
            )}
            onClick={() => onChange(option.id, option)}
          >
            <span className="truncate font-medium">{option.unitName}</span>
            {option.unitType ? <span className="ml-3 shrink-0 text-xs text-slate-400">{option.unitType}</span> : null}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {canCreate && onCreate ? (
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-0 text-xs" onClick={() => onCreate(query.trim())}>
              <Plus className="h-3.5 w-3.5" />
              跳转新增责任单位
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1">
              <ShieldAlert className="h-3.5 w-3.5" />
              未找到责任单位，请联系管理员维护主数据
            </span>
          )}
        </div>
      ) : null}
    </div>
  )
})

export default ParticipantUnitLookup
