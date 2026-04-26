import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
      return 'mapping_pending'
    case 'merged_into':
      return 'merged_into'
    default:
      return 'mapped'
  }
}

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
    <Card data-testid="deviation-detail-table" className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{mainlineLabel} · 详情表</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-hidden rounded-2xl border border-slate-100">
          <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
            <caption className="sr-only">{mainlineLabel} 偏差详情表</caption>
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">条目</th>
                <th scope="col" className="px-4 py-3 font-medium">状态</th>
                <th scope="col" className="px-4 py-3 font-medium">偏差</th>
                <th scope="col" className="px-4 py-3 font-medium">关系</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={`align-top ${onSelectRow ? 'cursor-pointer transition-colors hover:bg-slate-50' : ''}`}
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
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      计划 {row.planned_progress ?? 0}% · 实际 {row.actual_progress ?? 0}% · {row.actual_date || '无实际日期'}
                    </div>
                    {row.reason ? <div className="mt-2 text-xs leading-5 text-slate-500">{row.reason}</div> : null}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <div>{row.mainline}</div>
                    <div className="mt-1 text-xs text-slate-500">{row.status}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <div>{row.deviation_days} 天</div>
                    <div className="mt-1 text-xs text-slate-500">{row.deviation_rate}%</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                        {mappingStatusLabel(row.mapping_status)}
                      </span>
                      {row.mapping_status === 'mapping_pending' ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-700">mapping_pending</span>
                      ) : null}
                      {row.merged_into ? (
                        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs text-blue-700">
                          merged_into {row.merged_into.title}
                        </span>
                      ) : null}
                      {row.child_group ? (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs text-emerald-700">
                          child_group {row.child_group.parent_title} · {row.child_group.child_count}
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            暂无详情表数据
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
