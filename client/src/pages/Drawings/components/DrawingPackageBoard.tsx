import { ChevronRight, ChevronDown, FileText, FileWarning, Layers3, RefreshCw, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { DRAWING_REVIEW_MODE_LABELS, DRAWING_STATUS_LABELS } from '../constants'
import type { DrawingPackageCard } from '../types'

export interface DrawingPackageGroup {
  disciplineType: string
  packages: DrawingPackageCard[]
}

function ratioWidth(value: number) {
  return `${Math.max(0, Math.min(100, value))}%`
}

function statusLabel(status: string) {
  return DRAWING_STATUS_LABELS[status] ?? status
}

export function DrawingPackageBoard({
  groups,
  onSelectPackage,
  onOpenVersions,
  title = '图纸包主视图',
  subtitle = '',
  emptyTitle = '当前没有图纸包',
  emptyDescription = '',
}: {
  groups: DrawingPackageGroup[]
  onSelectPackage: (pkg: DrawingPackageCard) => void
  onOpenVersions: (pkg: DrawingPackageCard) => void
  title?: string
  subtitle?: string
  emptyTitle?: string
  emptyDescription?: string
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  void subtitle
  void emptyDescription

  function toggleGroup(disciplineType: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(disciplineType)) next.delete(disciplineType)
      else next.add(disciplineType)
      return next
    })
  }

  return (
    <section className="space-y-4" data-testid="drawing-package-board">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 md:flex">
          <Layers3 className="h-3.5 w-3.5" />
          专业 + 用途 / 属性
        </div>
      </div>

      {groups.length === 0 ? (
        <Card className="border-dashed border-slate-200 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <FileWarning className="h-10 w-10 text-slate-300" />
            <div className="text-base font-medium text-slate-900">{emptyTitle}</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.disciplineType)
            return (
            <section key={group.disciplineType} className="space-y-3">
              <button
                type="button"
                onClick={() => toggleGroup(group.disciplineType)}
                className="flex items-center gap-2 w-full text-left"
              >
                {isCollapsed ? <ChevronRight className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                <h3 className="text-sm font-semibold text-slate-700">{group.disciplineType}</h3>
                <span className="text-xs text-slate-400">{group.packages.length} 个包</span>
              </button>

              {!isCollapsed && <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {group.packages.map((pkg) => (
                  <Card key={pkg.packageId} className="overflow-hidden border-slate-200 shadow-sm" data-testid={`drawing-package-card-${pkg.packageId}`}>
                    <CardHeader className="space-y-3 border-b border-slate-100 bg-slate-50/70 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <CardTitle className="truncate text-lg text-slate-900">{pkg.packageName}</CardTitle>
                          <p className="mt-1 text-xs text-slate-500">{pkg.packageCode}</p>
                        </div>
                        <Badge variant="secondary" className="shrink-0 rounded-full px-2.5 py-1 text-xs">
                          {statusLabel(pkg.status)}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="rounded-full px-2.5 py-1 text-xs">
                          {pkg.disciplineType}
                        </Badge>
                        <Badge variant="outline" className="rounded-full px-2.5 py-1 text-xs">
                          {pkg.documentPurpose}
                        </Badge>
                        <Badge
                          variant={pkg.requiresReview ? 'default' : 'secondary'}
                          className="rounded-full px-2.5 py-1 text-xs"
                        >
                          {DRAWING_REVIEW_MODE_LABELS[pkg.reviewMode]}
                        </Badge>
                        {pkg.scheduleImpactFlag && (
                          <Badge variant="destructive" className="rounded-full px-2.5 py-1 text-xs">
                            工期影响
                          </Badge>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4 p-5">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>齐套度</span>
                          <span>{pkg.completenessRatio}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-blue-600" style={{ width: ratioWidth(pkg.completenessRatio) }} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                          <div className="text-xs text-slate-500">当前有效版</div>
                          <div className="mt-1 font-medium text-slate-900">{pkg.currentVersionLabel}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                          <div className="text-xs text-slate-500">缺漏项</div>
                          <div className="mt-1 font-medium text-slate-900">{pkg.missingRequiredCount} 项</div>
                        </div>
                      </div>

                      <div className="space-y-2 text-sm text-slate-600">
                        <div className="flex items-center justify-between gap-3">
                          <span className="inline-flex items-center gap-2">
                            <FileText className="h-4 w-4 text-slate-400" />
                            当前审图
                          </span>
                          <span className="font-medium text-slate-900">{pkg.currentReviewStatus}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="inline-flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-slate-400" />
                            送审要求
                          </span>
                          <span className="font-medium text-slate-900">{pkg.reviewModeLabel}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="inline-flex items-center gap-2">
                            <RefreshCw className="h-4 w-4 text-slate-400" />
                            变更 / 风险
                          </span>
                          <span className="font-medium text-slate-900">
                            {pkg.hasChange ? '有变更' : '无变更'}
                            {pkg.scheduleImpactFlag ? ' · 影响工期' : ''}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`drawing-package-detail-${pkg.packageId}`}
                          onClick={() => onSelectPackage(pkg)}
                        >
                          查看详情
                          <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`drawing-package-versions-${pkg.packageId}`}
                          onClick={() => onOpenVersions(pkg)}
                        >
                          查看版本
                        </Button>
                        {pkg.missingRequiredCount > 0 && (
                          <Button size="sm" variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100" onClick={() => onSelectPackage(pkg)}>
                            查看缺漏 ({pkg.missingRequiredCount})
                          </Button>
                        )}
                        {pkg.requiresReview && (
                          <Button size="sm" variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" onClick={() => onSelectPackage(pkg)}>
                            查看送审
                          </Button>
                        )}
                      </div>
                      {((pkg.linkedTaskCount ?? 0) > 0 || (pkg.linkedAcceptanceCount ?? 0) > 0 || (pkg.linkedCertificateCount ?? 0) > 0) && (
                        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100" data-testid={`drawing-package-impact-tags-${pkg.packageId}`}>
                          {(pkg.linkedTaskCount ?? 0) > 0 && (
                            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                              影响任务 {pkg.linkedTaskCount} 项
                            </span>
                          )}
                          {(pkg.linkedAcceptanceCount ?? 0) > 0 && (
                            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                              影响验收 {pkg.linkedAcceptanceCount} 项
                            </span>
                          )}
                          {(pkg.linkedCertificateCount ?? 0) > 0 && (
                            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                              影响证照 {pkg.linkedCertificateCount} 项
                            </span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>}
            </section>
            )
          })}
        </div>
      )}
    </section>
  )
}
