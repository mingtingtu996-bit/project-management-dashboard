import { useState } from 'react'
import { FilePenLine, Files, Layers3, Search, Star } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { DRAWING_REVIEW_MODE_LABELS, DRAWING_STATUS_LABELS } from '../constants'
import type { DrawingLedgerRow } from '../types'

function statusLabel(value: string) {
  return DRAWING_STATUS_LABELS[value] ?? value
}

export function DrawingLedger({
  drawings,
  totalCount,
  onSelectRow,
  onOpenVersions,
  onSetCurrentVersion,
}: {
  drawings: DrawingLedgerRow[]
  totalCount?: number
  onSelectRow: (row: DrawingLedgerRow) => void
  onOpenVersions: (row: DrawingLedgerRow) => void
  onSetCurrentVersion?: (row: DrawingLedgerRow) => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showExtraCols, setShowExtraCols] = useState(false)
  const isFiltered = totalCount !== undefined && totalCount > drawings.length
  const displayRows = searchQuery.trim()
    ? drawings.filter((row) => {
        const q = searchQuery.toLowerCase()
        return row.drawingName.toLowerCase().includes(q) || row.drawingCode.toLowerCase().includes(q) || row.packageName.toLowerCase().includes(q)
      })
    : drawings
  return (
    <section className="space-y-4" data-testid="drawing-ledger">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">图纸台账</h2>
          <p className="mt-1 text-sm text-slate-500">这里是单图编辑与版本追踪的入口，仍然以图纸包为上层主对象。</p>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 md:flex">
          <Layers3 className="h-3.5 w-3.5" />
          单图记录仅作为明细承载
        </div>
        <button
          type="button"
          onClick={() => setShowExtraCols((v) => !v)}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          {showExtraCols ? '收起列' : '展开更多列'}
        </button>
      </div>

      {isFiltered && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700" data-testid="drawing-ledger-filter-hint">
          当前筛选条件下共显示 {drawings.length} 条，共 {totalCount} 条图纸记录。
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索图纸名称、图纸编号、图纸包..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:outline-none"
          data-testid="drawing-ledger-search"
        />
      </div>

      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/70">
          <CardTitle className="text-base text-slate-900">单图台账明细</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {drawings.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <Files className="h-10 w-10 text-slate-300" />
              <div className="text-base font-medium text-slate-900">暂无图纸台账</div>
              <div className="text-sm text-slate-500">当前项目还没有可展示的单图记录。</div>
            </div>
          ) : displayRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <Files className="h-10 w-10 text-slate-300" />
              <div className="text-base font-medium text-slate-900">没有匹配结果</div>
              <div className="text-sm text-slate-500">没有符合搜索条件的图纸记录。</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
                <caption className="sr-only">施工图纸台账明细表</caption>
                <thead className="bg-white text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th scope="col" className="px-4 py-3">图纸包</th>
                    <th scope="col" className="px-4 py-3">图纸</th>
                    <th scope="col" className="px-4 py-3">专业 / 用途</th>
                    <th scope="col" className="px-4 py-3">版本</th>
                    <th scope="col" className="px-4 py-3">当前版</th>
                    <th scope="col" className="px-4 py-3">变更</th>
                    <th scope="col" className="px-4 py-3">状态</th>
                    <th scope="col" className="px-4 py-3">影响工期</th>
                    <th scope="col" className="px-4 py-3">齐套率</th>
                    <th scope="col" className="px-4 py-3">设计单位</th>
                    <th scope="col" className="px-4 py-3">审图单位</th>
                    {showExtraCols && <th scope="col" className="px-4 py-3">设计负责人</th>}
                    {showExtraCols && <th scope="col" className="px-4 py-3">备注</th>}
                    <th scope="col" className="px-4 py-3">计划送审</th>
                    <th scope="col" className="px-4 py-3">实际送审</th>
                    <th scope="col" className="px-4 py-3">计划通过</th>
                    <th scope="col" className="px-4 py-3">实际通过</th>
                    <th scope="col" className="px-4 py-3">审图</th>
                    <th scope="col" className="px-4 py-3">动作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {displayRows.map((row) => (
                    <tr key={row.drawingId} className="transition-colors hover:bg-slate-50/80" data-testid={`drawing-ledger-row-${row.drawingId}`}>
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-900">{row.packageName}</div>
                        <div className="mt-1 text-xs text-slate-500">{row.packageCode}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-900">{row.drawingName}</div>
                        <div className="mt-1 text-xs text-slate-500">{row.drawingCode}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-slate-900">{row.disciplineType}</div>
                        <div className="mt-1 text-xs text-slate-500">{row.documentPurpose}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-900">{row.versionNo}</div>
                      </td>
                      <td className="px-4 py-4">
                        {row.isCurrentVersion ? (
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">当前版</span>
                        ) : (
                          <span className="text-xs text-slate-400">历史版</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {row.hasChange ? (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">有变更</span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant="secondary" className="rounded-full px-2.5 py-1 text-xs">
                          {statusLabel(row.drawingStatus)}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        {row.scheduleImpactFlag ? (
                          <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">影响工期</span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {row.requiresReview ? (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">需送审</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">免审图</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">{row.designUnit || '—'}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{row.reviewUnit || '—'}</td>
                      {showExtraCols && <td className="px-4 py-4 text-sm text-slate-600">{row.designPerson || '—'}</td>}
                      {showExtraCols && <td className="px-4 py-4 text-sm text-slate-600 max-w-[160px] truncate" title={row.notes ?? undefined}>{row.notes || '—'}</td>}
                      <td className="px-4 py-4 text-sm text-slate-600">{row.plannedSubmitDate || '—'}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{row.actualSubmitDate || '—'}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{row.plannedPassDate || '—'}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{row.actualPassDate || '—'}</td>
                      <td className="px-4 py-4">
                        <div className="text-slate-900">{DRAWING_REVIEW_MODE_LABELS[row.reviewMode]}</div>
                        <div className="mt-1 text-xs text-slate-500">{row.reviewStatus}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`drawing-ledger-detail-${row.drawingId}`}
                            onClick={() => onSelectRow(row)}
                          >
                            <FilePenLine className="mr-2 h-4 w-4" />
                            详情
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`drawing-ledger-versions-${row.drawingId}`}
                            onClick={() => onOpenVersions(row)}
                          >
                            版本
                          </Button>
                          {onSetCurrentVersion && !row.isCurrentVersion && (
                            <Button
                              size="sm"
                              variant="outline"
                              data-testid={`drawing-ledger-set-current-${row.drawingId}`}
                              onClick={() => onSetCurrentVersion(row)}
                            >
                              <Star className="mr-2 h-4 w-4" />
                              设为当前有效版
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
