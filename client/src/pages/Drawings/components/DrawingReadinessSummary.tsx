import type { ElementType } from 'react'
import { ArrowUpRight, AlertTriangle, CircleCheckBig, Layers3, RefreshCw, ShieldCheck } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'

import type { DrawingBoardSummary } from '../types'

function SummaryTile({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string
  value: string | number
  hint: string
  tone: 'blue' | 'amber' | 'red' | 'emerald' | 'slate'
  icon: ElementType
}) {
  void hint

  const toneClasses = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  } as const

  const valueClasses = {
    blue: 'text-blue-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
    emerald: 'text-emerald-700',
    slate: 'text-slate-800',
  } as const

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-slate-500">{label}</div>
          <div className={`rounded-full border px-2.5 py-1 text-xs ${toneClasses[tone]}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className={`text-3xl font-semibold tracking-tight ${valueClasses[tone]}`}>{value}</div>
      </CardContent>
    </Card>
  )
}

export function DrawingReadinessSummary({
  summary,
  projectName,
}: {
  summary: DrawingBoardSummary
  projectName?: string
}) {
  void projectName

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">图纸准备度总览</h2>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          label="图纸包总数"
          value={summary.totalPackages}
          hint="页面主对象按包统计，不再平铺所有单图。"
          tone="blue"
          icon={Layers3}
        />
        <SummaryTile
          label="缺漏图纸包"
          value={summary.missingPackages}
          hint="应有项未补齐的图纸包。"
          tone="red"
          icon={AlertTriangle}
        />
        <SummaryTile
          label="必审图纸包"
          value={summary.mandatoryReviewPackages}
          hint="默认需要送审或法定送审的包。"
          tone="amber"
          icon={ShieldCheck}
        />
        <SummaryTile
          label="可施工 / 可验收"
          value={`${summary.readyForConstructionCount}/${summary.readyForAcceptanceCount}`}
          hint="前者是施工可用，后者是竣工归档可验收。"
          tone="emerald"
          icon={CircleCheckBig}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="flex items-center justify-between gap-3 p-5">
            <div>
              <div className="text-sm text-slate-500">本月计划送审</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{summary.plannedSubmitThisMonthCount ?? 0}</div>
            </div>
            <div className="rounded-full border border-blue-200 bg-blue-50 p-2 text-blue-700">
              <ArrowUpRight className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="flex items-center justify-between gap-3 p-5">
            <div>
              <div className="text-sm text-slate-500">送审 / 处理中</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{summary.reviewingPackages}</div>
            </div>
            <div className="rounded-full border border-amber-200 bg-amber-50 p-2 text-amber-700">
              <ArrowUpRight className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="flex items-center justify-between gap-3 p-5">
            <div>
              <div className="text-sm text-slate-500">工期影响包</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{summary.scheduleImpactCount}</div>
            </div>
            <div className="rounded-full border border-red-200 bg-red-50 p-2 text-red-700">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="flex items-center justify-between gap-3 p-5">
            <div>
              <div className="text-sm text-slate-500">当前工作判断</div>
              <div className="mt-1 text-sm font-medium text-slate-900">
                {summary.missingPackages > 0 ? '先补齐缺漏，再看送审' : '基础齐套，进入版本与送审窗口'}
              </div>
            </div>
            <div className="rounded-full border border-blue-200 bg-blue-50 p-2 text-blue-700">
              <RefreshCw className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
        {summary.criticalBlockingDiscipline ? (
          <Card className="border-amber-200 shadow-sm">
            <CardContent className="flex items-center justify-between gap-3 p-5">
              <div>
                <div className="text-sm text-slate-500">当前关键卡点专业</div>
                <div className="mt-1 text-sm font-medium text-amber-700" data-testid="drawing-critical-blocking-discipline">
                  {summary.criticalBlockingDiscipline}
                </div>
              </div>
              <div className="rounded-full border border-amber-200 bg-amber-50 p-2 text-amber-700">
                <AlertTriangle className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  )
}
