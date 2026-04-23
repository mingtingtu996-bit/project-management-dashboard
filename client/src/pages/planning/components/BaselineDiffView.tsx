import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

export type BaselineDiffKind = '新增' | '修改' | '移除' | '里程碑变动'

export interface BaselineDiffItem {
  id: string
  kind: BaselineDiffKind
  title: string
  before: string
  after: string
  note?: string
}

export interface BaselineDiffViewProps {
  fromVersionLabel: string
  toVersionLabel: string
  items: BaselineDiffItem[]
}

const kindClassName: Record<BaselineDiffKind, string> = {
  新增: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  修改: 'border-blue-200 bg-blue-50 text-blue-700',
  移除: 'border-rose-200 bg-rose-50 text-rose-700',
  里程碑变动: 'border-violet-200 bg-violet-50 text-violet-700',
}

function buildCounts(items: BaselineDiffItem[]) {
  return items.reduce(
    (acc, item) => {
      acc[item.kind] += 1
      return acc
    },
    { 新增: 0, 修改: 0, 移除: 0, 里程碑变动: 0 } as Record<BaselineDiffKind, number>,
  )
}

export function BaselineDiffView({ fromVersionLabel, toVersionLabel, items }: BaselineDiffViewProps) {
  const counts = buildCounts(items)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">完整差异视图</h3>
          <p className="text-xs text-slate-500">
            {fromVersionLabel} vs {toVersionLabel}
          </p>
        </div>
        <Badge variant="outline">{items.length} 条变更</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="space-y-1 p-4">
            <div className="text-xs text-slate-500">版本对比</div>
            <div className="text-lg font-semibold text-slate-900">
              {fromVersionLabel} → {toVersionLabel}
            </div>
          </CardContent>
        </Card>
        {(['新增', '修改', '移除', '里程碑变动'] as BaselineDiffKind[]).map((kind) => (
          <Card key={kind} className="border-slate-200 shadow-sm">
            <CardContent className="space-y-1 p-4">
              <div className="text-xs text-slate-500">{kind}</div>
              <div className="text-lg font-semibold text-slate-900">{counts[kind]}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <Card key={item.id} className="border-slate-200 shadow-sm">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={kindClassName[item.kind]}>
                  {item.kind}
                </Badge>
                <span className="font-medium text-slate-900">{item.title}</span>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                    <div className="font-medium text-slate-900">{fromVersionLabel}</div>
                    <div className="mt-1 truncate">{item.before}</div>
                  </div>
                  <div className="flex items-center gap-2 text-cyan-600">
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                    <span className="h-px w-10 bg-cyan-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
                  </div>
                  <div className="min-w-0 flex-1 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-900">
                    <div className="font-medium">{toVersionLabel}</div>
                    <div className="mt-1 truncate">{item.after}</div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <div className="text-xs font-medium text-slate-500">{fromVersionLabel}</div>
                  <div className="mt-1 text-sm leading-6 text-slate-700">{item.before}</div>
                </div>
                <div className="rounded-xl border border-cyan-100 bg-cyan-50/70 px-3 py-2">
                  <div className="text-xs font-medium text-cyan-600">{toVersionLabel}</div>
                  <div className="mt-1 text-sm leading-6 text-cyan-900">{item.after}</div>
                </div>
              </div>

              {item.note ? <p className="text-xs leading-6 text-slate-500">{item.note}</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default BaselineDiffView
