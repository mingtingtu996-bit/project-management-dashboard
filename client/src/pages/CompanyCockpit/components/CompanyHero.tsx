import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  AlertTriangle,
  Plus,
  RefreshCw,
} from 'lucide-react'
import type { HealthHistory, HeroStatItem } from '../types'
import {
  formatDelta,
} from '../utils'

interface CompanyHeroProps {
  search: string
  onSearchChange: (value: string) => void
  onRefresh: () => void
  onCreate: () => void
  error: string | null
  heroStats: HeroStatItem[]
  healthHistory: HealthHistory
  stats: {
    inProgress: number
    completed: number
    paused: number
  }
  focusProjects?: unknown[]
  onNavigate: (path: string) => void
}

export function CompanyHero({
  search,
  onSearchChange,
  onRefresh,
  onCreate,
  error,
  heroStats,
  healthHistory,
  stats,
}: CompanyHeroProps) {
  return (
    <section className="shell-surface px-6 py-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <h1 className="shell-section-title">公司驾驶舱</h1>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="搜索项目"
              className="h-11 w-full rounded-2xl border-slate-200 bg-white sm:w-72"
            />
            <Button
              variant="outline"
              onClick={onRefresh}
              className="h-11 gap-2 rounded-2xl border-slate-200 bg-white px-5"
            >
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
            <Button onClick={onCreate} className="h-11 gap-2 rounded-2xl px-5">
              <Plus className="h-4 w-4" />
              新建项目
            </Button>
          </div>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {heroStats.map((item) => (
            <Card key={item.label} className="card-l2 border-slate-100">
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm text-slate-500">{item.label}</div>
                  <div className={`rounded-2xl p-2.5 ${item.tone}`}>
                    <item.icon className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">{item.value}</div>
                <p className="mt-2 text-xs text-slate-500">{item.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 趋势总览 */}
        <div className="rounded-[24px] border border-slate-100 bg-slate-50 px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-slate-900">趋势总览</div>
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
              进行中 {stats.inProgress} · 已完成 {stats.completed}
            </div>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
            <div className="rounded-2xl border border-white bg-white px-4 py-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>本月健康均值</span>
                <span>{healthHistory.change !== null ? formatDelta(healthHistory.change) : '暂无对比'}</span>
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                {healthHistory.thisMonth ?? '--'}
              </div>
              <div className="mt-3 h-2 rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${healthHistory.thisMonth ?? 0}%` }}
                />
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {healthHistory.lastMonthPeriod ? `对比 ${healthHistory.lastMonthPeriod}` : '暂无历史对比'}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white bg-white px-4 py-4">
                <div className="text-xs text-slate-500">已暂停</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{stats.paused}</div>
              </div>
              <div className="rounded-2xl border border-white bg-white px-4 py-4">
                <div className="text-xs text-slate-500">进行中</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{stats.inProgress}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
