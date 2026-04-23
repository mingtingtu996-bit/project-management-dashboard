import { Link2, AlertTriangle, ChevronRight } from 'lucide-react'
import { StatusBadge } from '@/components/ui/status-badge'
import type { CertificateSharedRibbonItem } from '../types'
import { getCertificateStatusThemeKey, mapCertificateStatusLabel } from '../constants'

interface CertificateSharedRibbonProps {
  items: CertificateSharedRibbonItem[]
  selectedWorkItemId?: string | null
  hoveredWorkItemId?: string | null
  hoveredCertificateId?: string | null
  onSelectWorkItem: (workItemId: string) => void
  onHoverWorkItem?: (workItemId: string | null) => void
}

export function CertificateSharedRibbon({
  items,
  selectedWorkItemId,
  hoveredWorkItemId,
  hoveredCertificateId,
  onSelectWorkItem,
  onHoverWorkItem,
}: CertificateSharedRibbonProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 text-sm text-slate-500">
        当前没有跨证共享事项。
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Link2 className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900">共享事项条带</h3>
        <span className="text-xs text-slate-500">用于表达跨证共享办理事项</span>
      </div>
      <div className="grid gap-3">
        {items.map((item) => {
          const active = selectedWorkItemId === item.work_item_id
          const hovered = hoveredWorkItemId === item.work_item_id
          // #1: dim items not related to the currently hovered certificate type
          const dimmed = Boolean(
            hoveredCertificateId
            && !item.certificate_types.includes(hoveredCertificateId)
          )
          return (
            <button
              key={item.work_item_id}
              type="button"
              onClick={() => onSelectWorkItem(item.work_item_id)}
              onMouseEnter={() => onHoverWorkItem?.(item.work_item_id)}
              onMouseLeave={() => onHoverWorkItem?.(null)}
              style={dimmed ? { opacity: 0.4 } : undefined}
              className={`w-full rounded-xl border px-4 py-3 text-left transition-all ${
                active
                  ? 'border-blue-300 bg-blue-50 shadow-sm'
                  : hovered
                    ? 'border-indigo-200 bg-indigo-50/60 shadow-sm'
                    : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900">{item.item_name}</span>
                    {item.is_shared && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                        共享
                      </span>
                    )}
                    {item.block_reason && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        <AlertTriangle className="h-3 w-3" />
                        阻塞
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{item.item_stage}</span>
                    <span>·</span>
                    <span>{mapCertificateStatusLabel(item.status)}</span>
                    <span>·</span>
                    <span>影响 {item.dependency_count} 张证</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <StatusBadge status={getCertificateStatusThemeKey(item.status)} fallbackLabel={mapCertificateStatusLabel(item.status)} className="px-2 py-1">
                    {mapCertificateStatusLabel(item.status)}
                  </StatusBadge>
                  <ChevronRight className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.certificate_names.map((name) => (
                  <span key={name} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 border border-slate-200">
                    {name}
                  </span>
                ))}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
