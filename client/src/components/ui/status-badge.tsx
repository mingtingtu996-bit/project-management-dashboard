import { useEffect, useMemo, useState } from 'react'
import type { BadgeProps } from '@/components/ui/badge'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getStatusTheme } from '@/lib/statusTheme'
import { listStatusValues, type StatusValue } from '@/services/statusDictionaryApi'

interface StatusBadgeProps extends BadgeProps {
  status: string
  fallbackLabel?: string
  /** v1.4.5: Backend status DTO — when provided, overrides local theme lookup */
  statusDomain?: string
  statusKey?: string
  visualTone?: string
  semanticTone?: string
  dictionaryVersion?: string
}

const statusValueCache = new Map<string, StatusValue[]>()
const statusValuePromiseCache = new Map<string, Promise<StatusValue[]>>()

/** Map visual tone from backend to Tailwind classes */
function visualToneToClass(tone?: string): string {
  switch (tone) {
    case 'green': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'blue': return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'amber': return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'red': return 'bg-red-100 text-red-700 border-red-200'
    case 'slate': return 'bg-slate-100 text-slate-600 border-slate-200'
    default: return ''
  }
}

function normalizeStatusKey(value?: string | null) {
  return String(value ?? '').trim().toLowerCase()
}

async function getCachedStatusValues(domainKey: string): Promise<StatusValue[]> {
  if (statusValueCache.has(domainKey)) {
    return statusValueCache.get(domainKey) ?? []
  }

  if (!statusValuePromiseCache.has(domainKey)) {
    statusValuePromiseCache.set(
      domainKey,
      listStatusValues(domainKey)
        .then((values) => {
          statusValueCache.set(domainKey, values)
          statusValuePromiseCache.delete(domainKey)
          return values
        })
        .catch(() => {
          statusValuePromiseCache.delete(domainKey)
          return []
        }),
    )
  }

  return statusValuePromiseCache.get(domainKey) ?? Promise.resolve([])
}

function findStatusValue(values: StatusValue[], key: string) {
  const normalizedKey = normalizeStatusKey(key)
  return values.find((value) => normalizeStatusKey(value.status_key) === normalizedKey) ?? null
}

export function StatusBadge({
  status,
  fallbackLabel,
  className,
  children,
  statusDomain,
  statusKey,
  visualTone,
  semanticTone,
  dictionaryVersion,
  ...props
}: StatusBadgeProps) {
  const resolvedStatusKey = statusKey || status
  const [dictionaryValue, setDictionaryValue] = useState<StatusValue | null>(null)

  useEffect(() => {
    if (!statusDomain || visualTone) {
      setDictionaryValue(null)
      return
    }

    let cancelled = false
    void getCachedStatusValues(statusDomain).then((values) => {
      if (!cancelled) {
        setDictionaryValue(findStatusValue(values, resolvedStatusKey))
      }
    })

    return () => {
      cancelled = true
    }
  }, [resolvedStatusKey, statusDomain, visualTone])

  const dictionaryTone = visualTone || semanticTone || dictionaryValue?.visual_tone || dictionaryValue?.semantic_tone
  const dictionaryLabel = fallbackLabel ?? dictionaryValue?.status_label_short ?? dictionaryValue?.status_label

  const toneClass = dictionaryTone ? visualToneToClass(dictionaryTone) : ''
  const hasProvidedTone = Boolean(visualTone || semanticTone)
  const theme = hasProvidedTone && toneClass
    ? { label: dictionaryLabel ?? status, className: toneClass }
    : dictionaryValue && toneClass
      ? { label: dictionaryLabel ?? status, className: toneClass }
    : getStatusTheme(status, fallbackLabel)
  const renderedLabel = useMemo(
    () => children ?? (dictionaryLabel && toneClass ? dictionaryLabel : theme.label),
    [children, dictionaryLabel, theme.label, toneClass],
  )

  return (
    <Badge
      {...props}
      className={cn(theme.className, className)}
      data-status-domain={statusDomain}
      data-status-key={statusKey || status}
      data-dictionary-version={dictionaryVersion}
    >
      {renderedLabel}
    </Badge>
  )
}

export default StatusBadge
