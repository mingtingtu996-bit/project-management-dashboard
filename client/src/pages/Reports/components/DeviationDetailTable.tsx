import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { CardHead } from '@/components/ui/card-head'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type DetailRow = {
  id: string
  title: string
  mainline: string
  planned_progress?: number | null
  actual_progress?: number | null
  actual_date?: string | null
  deviation_days: number
  deviation_rate: number
  status: string
  reason?: string | null
  mapping_status?: 'mapped' | 'mapping_pending' | 'merged_into' | null
  merged_into?: { title: string } | null
  child_group?: { parent_title: string; child_count: number } | null
}

function mappingStatusLabel(status?: DetailRow['mapping_status']) {
  switch (status) {
    case 'mapping_pending':
      return '待关联'
    case 'merged_into':
      return '已合并'
    default:
      return '已关联'
  }
}

const DEVIATION_DETAIL_COLUMN_WIDTHS = {
  title: 360,
  status: 180,
  deviation: 140,
  relation: 280,
} as const

const DEVIATION_DETAIL_TABLE_MIN_WIDTH = Object.values(DEVIATION_DETAIL_COLUMN_WIDTHS).reduce((sum, width) => sum + width, 0)

export function DeviationDetailTable({
  rows,
  mainlineLabel,
  onSelectRow,
}: {
  rows: DetailRow[]
  mainlineLabel: string
  onSelectRow?: (row: DetailRow) => void
}) {
  return (
    <Card data-testid="deviation-detail-table" variant="surface">
      <CardContent padding="md" className="pb-0">
        <CardHead eyebrow="DETAIL" title={`${mainlineLabel} · 详情表`} />
      </CardContent>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <EmptyState
            title="暂无详情表数据"
            description="当前视图没有可展示的执行偏差明细。"
            className="rounded-xl empty-state-frame border-slate-200 bg-slate-50 py-10"
          />
        ) : (
        <div className="overflow-hidden rounded-xl border border-slate-100">
          <Table className="w-full table-fixed text-left text-sm" style={{ minWidth: DEVIATION_DETAIL_TABLE_MIN_WIDTH }}>
            <TableCaption className="sr-only">{mainlineLabel} 偏差详情表</TableCaption>
            <TableHeader className="sticky top-0 z-10 bg-white text-xs uppercase tracking-wider text-slate-500">
              <TableRow className="py-3">
                <TableHead scope="col" className="px-4 py-3 font-medium" style={{ width: DEVIATION_DETAIL_COLUMN_WIDTHS.title }}>条目</TableHead>
                <TableHead scope="col" className="px-4 py-3 font-medium" style={{ width: DEVIATION_DETAIL_COLUMN_WIDTHS.status }}>状态</TableHead>
                <TableHead scope="col" className="px-4 py-3 text-right font-medium num-mono" style={{ width: DEVIATION_DETAIL_COLUMN_WIDTHS.deviation }}>偏差</TableHead>
                <TableHead scope="col" className="px-4 py-3 font-medium" style={{ width: DEVIATION_DETAIL_COLUMN_WIDTHS.relation }}>关系</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="bg-white">
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={`py-3 align-top even:bg-slate-50/50 hover:bg-slate-100/60 ${onSelectRow ? 'cursor-pointer transition-colors' : ''}`}
                  role={onSelectRow ? 'button' : undefined}
                  tabIndex={onSelectRow ? 0 : undefined}
                  onClick={onSelectRow ? () => onSelectRow(row) : undefined}
                  onKeyDown={onSelectRow ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelectRow(row)
                    }
                  } : undefined}
                >
                  <TableCell className="max-w-0 px-4 py-3" style={{ width: DEVIATION_DETAIL_COLUMN_WIDTHS.title }}>
                    <div className="truncate font-medium text-slate-900" title={row.title}>{row.title}</div>
                    <div className="mt-1 text-xs text-slate-500 num-mono">
                      计划 {row.planned_progress ?? 0}% · 实际 {row.actual_progress ?? 0}% · {row.actual_date || '无实际日期'}
                    </div>
                    {row.reason ? <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500" title={row.reason}>{row.reason}</div> : null}
                  </TableCell>
                  <TableCell className="max-w-0 px-4 py-3 text-slate-700" style={{ width: DEVIATION_DETAIL_COLUMN_WIDTHS.status }}>
                    <div className="truncate" title={row.mainline}>{row.mainline}</div>
                    <div className="mt-1 truncate text-xs text-slate-500" title={row.status}>{row.status}</div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-slate-700 num-mono" style={{ width: DEVIATION_DETAIL_COLUMN_WIDTHS.deviation }}>
                    <div>{row.deviation_days} 天</div>
                    <div className="mt-1 text-xs text-slate-500">{row.deviation_rate}%</div>
                  </TableCell>
                  <TableCell className="px-4 py-3" style={{ width: DEVIATION_DETAIL_COLUMN_WIDTHS.relation }}>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                        {mappingStatusLabel(row.mapping_status)}
                      </span>
                      {row.mapping_status === 'mapping_pending' ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-700">待关联</span>
                      ) : null}
                      {row.merged_into ? (
                        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs text-blue-700">
                          合并到 {row.merged_into.title}
                        </span>
                      ) : null}
                      {row.child_group ? (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs text-emerald-700">
                          子项组 {row.child_group.parent_title} · {row.child_group.child_count}
                        </span>
                      ) : null}
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
  )
}
