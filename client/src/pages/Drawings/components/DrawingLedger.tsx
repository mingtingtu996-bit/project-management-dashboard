import { useState } from 'react'
import { FilePenLine, Files, Layers3, Search, SlidersHorizontal, Star } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

import { DRAWING_REVIEW_MODE_LABELS, DRAWING_STATUS_LABELS } from '../constants'
import type { DrawingLedgerRow } from '../types'

function statusLabel(value: string) {
  return DRAWING_STATUS_LABELS[value] ?? value
}

function statusDotClass(value: string) {
  if (value === 'issued' || value === 'completed') return 'bg-emerald-500'
  if (value === 'reviewing' || value === 'revising') return 'bg-blue-600'
  if (value === 'preparing') return 'bg-amber-500'
  return 'bg-slate-400'
}

function resolveMainDate(row: DrawingLedgerRow) {
  return row.actualPassDate || row.plannedPassDate || row.actualSubmitDate || row.plannedSubmitDate || row.createdAt || '—'
}

function resolveApprover(row: DrawingLedgerRow) {
  return row.designPerson || row.reviewUnit || '未指定'
}

const extraColumnOptions = [
  { id: 'package', label: '图纸包' },
  { id: 'purpose', label: '用途 / 属性' },
  { id: 'current', label: '当前版' },
  { id: 'change', label: '变更' },
  { id: 'impact', label: '影响工期' },
  { id: 'review', label: '审图要求' },
  { id: 'designUnit', label: '设计单位' },
  { id: 'reviewUnit', label: '审图单位' },
  { id: 'notes', label: '备注' },
  { id: 'submitDates', label: '送审日期' },
  { id: 'passDates', label: '通过日期' },
] as const

type ExtraColumnId = (typeof extraColumnOptions)[number]['id']
type ExtraColumnState = Record<ExtraColumnId, boolean>

const initialExtraColumns = extraColumnOptions.reduce((state, option) => {
  state[option.id] = false
  return state
}, {} as ExtraColumnState)

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
  const [extraColumns, setExtraColumns] = useState<ExtraColumnState>(initialExtraColumns)
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
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 md:flex">
          <Layers3 className="h-3.5 w-3.5" />
          单图记录仅作为明细承载
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              data-testid="drawing-more-columns-trigger"
            >
              <SlidersHorizontal className="h-4 w-4" />
              更多列
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" side="bottom" className="w-64 p-3">
            <div className="space-y-3" data-testid="drawing-more-columns-popover">
              <div>
                <div className="text-sm font-medium text-slate-900">更多列</div>
                <p className="text-xs text-slate-400">默认只展示 8 个高频字段。</p>
              </div>
              <div className="space-y-2">
                {extraColumnOptions.map((option) => (
                  <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                    <Checkbox
                      checked={extraColumns[option.id]}
                      onCheckedChange={(checked) =>
                        setExtraColumns((current) => ({
                          ...current,
                          [option.id]: checked === true,
                        }))
                      }
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
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
          aria-label="搜索单图台账"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索图纸名称、图纸编号、图纸包..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:outline-none"
          data-testid="drawing-ledger-search"
        />
      </div>

      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="bg-slate-50/70">
          <CardTitle className="text-base text-slate-900">单图台账明细</CardTitle>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {drawings.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <Files className="h-8 w-8 text-slate-300" />
              <div className="text-base font-medium text-slate-900">暂无图纸台账</div>
            </div>
          ) : displayRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <Files className="h-8 w-8 text-slate-300" />
              <div className="text-base font-medium text-slate-900">没有匹配结果</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-full text-left text-sm">
                <TableCaption className="sr-only">施工图纸台账明细表</TableCaption>
                <TableHeader className="sticky top-0 z-10 bg-white text-xs uppercase tracking-wide text-slate-500">
                  <TableRow className="py-3">
                    <TableHead scope="col" className="px-4 py-3 text-right tabular-nums">序号</TableHead>
                    <TableHead scope="col" className="px-4 py-3">图纸</TableHead>
                    <TableHead scope="col" className="px-4 py-3">专业</TableHead>
                    <TableHead scope="col" className="px-4 py-3 text-right tabular-nums">版本</TableHead>
                    <TableHead scope="col" className="px-4 py-3">状态</TableHead>
                    <TableHead scope="col" className="px-4 py-3">审批人</TableHead>
                    <TableHead scope="col" className="px-4 py-3 text-right tabular-nums">日期</TableHead>
                    {extraColumns.package && <TableHead scope="col" className="px-4 py-3">图纸包</TableHead>}
                    {extraColumns.purpose && <TableHead scope="col" className="px-4 py-3">用途 / 属性</TableHead>}
                    {extraColumns.current && <TableHead scope="col" className="px-4 py-3">当前版</TableHead>}
                    {extraColumns.change && <TableHead scope="col" className="px-4 py-3">变更</TableHead>}
                    {extraColumns.impact && <TableHead scope="col" className="px-4 py-3">影响工期</TableHead>}
                    {extraColumns.review && <TableHead scope="col" className="px-4 py-3">审图要求</TableHead>}
                    {extraColumns.designUnit && <TableHead scope="col" className="px-4 py-3">设计单位</TableHead>}
                    {extraColumns.reviewUnit && <TableHead scope="col" className="px-4 py-3">审图单位</TableHead>}
                    {extraColumns.notes && <TableHead scope="col" className="px-4 py-3">备注</TableHead>}
                    {extraColumns.submitDates && <TableHead scope="col" className="px-4 py-3 text-right tabular-nums">送审日期</TableHead>}
                    {extraColumns.passDates && <TableHead scope="col" className="px-4 py-3 text-right tabular-nums">通过日期</TableHead>}
                    <TableHead scope="col" className="px-4 py-3">动作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="bg-white">
                  {displayRows.map((row, index) => (
                    <TableRow
                      key={row.drawingId}
                      className="group py-3 transition-colors even:bg-slate-50/50 hover:bg-slate-100/60"
                      data-testid={`drawing-ledger-row-${row.drawingId}`}
                    >
                      <TableCell className="px-4 py-4 text-right text-sm text-slate-500 tabular-nums">{index + 1}</TableCell>
                      <TableCell className="px-4 py-4">
                        <div className="font-medium text-slate-900">{row.drawingName}</div>
                        <div className="mt-1 text-xs text-slate-500">{row.drawingCode}</div>
                      </TableCell>
                      <TableCell className="px-4 py-4 text-slate-900">{row.disciplineType}</TableCell>
                      <TableCell className="px-4 py-4 text-right tabular-nums">
                        <div className="font-medium text-slate-900">{row.versionNo}</div>
                      </TableCell>
                      <TableCell className="px-4 py-4">
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                          <span className={cn('h-2 w-2 rounded-full', statusDotClass(row.drawingStatus))} />
                          {statusLabel(row.drawingStatus)}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-4 text-sm text-slate-600">{resolveApprover(row)}</TableCell>
                      <TableCell className="px-4 py-4 text-right text-sm text-slate-600 tabular-nums">{resolveMainDate(row)}</TableCell>
                      {extraColumns.package && (
                        <TableCell className="px-4 py-4">
                        <div className="font-medium text-slate-900">{row.packageName}</div>
                        <div className="mt-1 text-xs text-slate-500">{row.packageCode}</div>
                      </TableCell>
                      )}
                      {extraColumns.purpose && <TableCell className="px-4 py-4 text-sm text-slate-600">{row.documentPurpose}</TableCell>}
                      {extraColumns.current && (
                        <TableCell className="px-4 py-4">
                        {row.isCurrentVersion ? (
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">当前版</span>
                        ) : (
                          <span className="text-xs text-slate-400">历史版</span>
                        )}
                      </TableCell>
                      )}
                      {extraColumns.change && (
                        <TableCell className="px-4 py-4">
                        {row.hasChange ? (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">有变更</span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>
                      )}
                      {extraColumns.impact && (
                        <TableCell className="px-4 py-4">
                        {row.scheduleImpactFlag ? (
                          <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">影响工期</span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>
                      )}
                      {extraColumns.review && (
                        <TableCell className="px-4 py-4 text-sm text-slate-600">
                          {row.requiresReview ? (
                            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">需送审</span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">免审图</span>
                          )}
                          <div className="mt-1 text-xs text-slate-500">
                            {DRAWING_REVIEW_MODE_LABELS[row.reviewMode]} · {row.reviewStatus}
                          </div>
                      </TableCell>
                      )}
                      {extraColumns.designUnit && <TableCell className="px-4 py-4 text-sm text-slate-600">{row.designUnit || '—'}</TableCell>}
                      {extraColumns.reviewUnit && <TableCell className="px-4 py-4 text-sm text-slate-600">{row.reviewUnit || '—'}</TableCell>}
                      {extraColumns.notes && <TableCell className="max-w-[180px] truncate px-4 py-4 text-sm text-slate-600">{row.notes || '—'}</TableCell>}
                      {extraColumns.submitDates && (
                        <TableCell className="px-4 py-4 text-right text-sm text-slate-600 tabular-nums">
                          <div>{row.plannedSubmitDate || '—'}</div>
                          <div className="mt-1 text-xs text-slate-400">{row.actualSubmitDate || '—'}</div>
                        </TableCell>
                      )}
                      {extraColumns.passDates && (
                        <TableCell className="px-4 py-4 text-right text-sm text-slate-600 tabular-nums">
                          <div>{row.plannedPassDate || '—'}</div>
                          <div className="mt-1 text-xs text-slate-400">{row.actualPassDate || '—'}</div>
                        </TableCell>
                      )}
                      <TableCell className="px-4 py-4">
                        <div className="flex flex-wrap justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
