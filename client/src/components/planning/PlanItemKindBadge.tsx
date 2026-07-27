import {
  BadgeDollarSign,
  ClipboardCheck,
  FileText,
  Flag,
  Link2,
  Settings,
  ShieldCheck,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  getPlanItemKindLabel,
  isDefaultPlanItemKind,
  normalizePlanItemKind,
  type PlanItemKind,
} from '@/lib/planItemSemantics'

const KIND_CONFIG: Record<PlanItemKind, {
  icon: typeof ClipboardCheck
  badgeClass: string
  borderClass: string
}> = {
  work_task: {
    icon: Settings,
    badgeClass: 'border-slate-200 bg-white text-slate-600',
    borderClass: 'border-l-transparent',
  },
  management_task: {
    icon: Settings,
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
    borderClass: 'border-l-slate-300',
  },
  inspection_task: {
    icon: ClipboardCheck,
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
    borderClass: 'border-l-amber-400',
  },
  document_task: {
    icon: FileText,
    badgeClass: 'border-blue-200 bg-blue-50 text-blue-700',
    borderClass: 'border-l-blue-300',
  },
  commercial_task: {
    icon: BadgeDollarSign,
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    borderClass: 'border-l-emerald-400',
  },
  safety_control: {
    icon: ShieldCheck,
    badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
    borderClass: 'border-l-rose-500',
  },
  milestone: {
    icon: Flag,
    badgeClass: 'border-blue-200 bg-blue-50 text-blue-700',
    borderClass: 'border-l-blue-500',
  },
  linked_projection: {
    icon: Link2,
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-600',
    borderClass: 'border-l-slate-400',
  },
}

const TAG_CLASS_BY_NAME: Record<string, string> = {
  危大: 'border-rose-200 bg-rose-50 text-rose-700',
  专项: 'border-blue-200 bg-blue-50 text-blue-700',
  紧急: 'border-orange-200 bg-orange-50 text-orange-700',
  关键节点: 'border-amber-200 bg-amber-50 text-amber-700',
  联动: 'border-slate-200 bg-slate-50 text-slate-600',
}

export function getPlanItemKindBorderClass(kind?: string | null) {
  const normalized = normalizePlanItemKind(kind) ?? 'work_task'
  return KIND_CONFIG[normalized].borderClass
}

export function PlanItemKindBadge({
  kind,
  count,
  compact = false,
  showDefault = false,
  className,
}: {
  kind?: string | null
  count?: number
  compact?: boolean
  showDefault?: boolean
  className?: string
}) {
  const normalized = normalizePlanItemKind(kind) ?? 'work_task'
  if (!showDefault && isDefaultPlanItemKind(normalized)) return null
  const config = KIND_CONFIG[normalized]
  const Icon = config.icon
  return (
    <Badge variant="outline" className={cn('inline-flex items-center gap-1', config.badgeClass, compact ? 'h-5 px-1.5 text-xs' : 'h-6 px-2 text-xs', className)}>
      <Icon className="h-3 w-3" />
      <span>{getPlanItemKindLabel(normalized)}</span>
      {typeof count === 'number' ? <span className="tabular-nums">{count}</span> : null}
    </Badge>
  )
}

export function PlanItemTagBadge({ tag, className }: { tag: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn('inline-flex h-5 items-center px-1.5 text-xs', TAG_CLASS_BY_NAME[tag] ?? 'border-slate-200 bg-white text-slate-600', className)}
    >
      {tag}
    </Badge>
  )
}
