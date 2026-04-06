import { useState, type ReactNode } from 'react'
import { AlertTriangle, BarChart3, Bug, Clock, Zap } from 'lucide-react'

import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { localMonitor } from '@/lib/monitoring'

type MonitoringTab = 'api' | 'performance' | 'errors'

const tabs: Array<{ id: MonitoringTab; label: string; icon: typeof BarChart3 }> = [
  { id: 'api', label: '接口监控', icon: BarChart3 },
  { id: 'performance', label: '性能追踪', icon: Zap },
  { id: 'errors', label: '错误追踪', icon: Bug },
]

export default function MonitoringDashboard() {
  const [activeTab, setActiveTab] = useState<MonitoringTab>('api')

  return (
    <div className="space-y-6 page-enter">
      <PageHeader
        eyebrow="隐藏工具"
        title="监控中心"
        subtitle="当前页仅承接系统监控、性能追踪和错误排查，不进入主导航，也不改变监控数据来源或计算逻辑。"
      >
        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
          隐藏路由
        </Badge>
        <Badge variant="secondary" className="bg-blue-50 text-blue-700">
          工具页
        </Badge>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          icon={<BarChart3 className="h-5 w-5" />}
          label="接口请求"
          value={localMonitor.getApiMetrics().length}
          color="blue"
        />
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          label="平均响应"
          value={`${localMonitor.getAverageResponseTime().toFixed(0)}ms`}
          color="green"
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="错误率"
          value={`${(localMonitor.getErrorRate() * 100).toFixed(1)}%`}
          color={localMonitor.getErrorRate() > 0.1 ? 'red' : 'green'}
        />
        <StatCard
          icon={<Zap className="h-5 w-5" />}
          label="慢请求"
          value={localMonitor.getSlowRequests(3000).length}
          color={localMonitor.getSlowRequests(3000).length > 0 ? 'red' : 'green'}
        />
      </div>

      <section className="shell-surface overflow-hidden">
        <div className="border-b border-slate-100 px-6 pt-5">
          <nav className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-t-xl border border-b-0 px-4 py-2 text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-slate-200 bg-white text-slate-900 shadow-sm'
                    : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6 md:p-7">
          {activeTab === 'api' && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-slate-500">
              接口监控暂时由本地监控数据承接
            </div>
          )}

          {activeTab === 'performance' && <PerformanceMetrics />}

          {activeTab === 'errors' && <ErrorTracker />}
        </div>
      </section>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  color = 'blue',
}: {
  icon: ReactNode
  label: string
  value: string | number
  color?: 'blue' | 'green' | 'red' | 'orange'
}) {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-600',
    green: 'bg-green-50 border-green-200 text-green-600',
    red: 'bg-red-50 border-red-200 text-red-600',
    orange: 'bg-orange-50 border-orange-200 text-orange-600',
  }

  return (
    <div className={`border rounded-2xl p-4 shadow-sm ${colorClasses[color]}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm opacity-70">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  )
}

function PerformanceMetrics() {
  const metrics = localMonitor.getPerformanceMetrics()

  if (metrics.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500">
        <Zap className="mx-auto mb-4 h-12 w-12 opacity-50" />
        <p>暂无性能指标</p>
        <p className="mt-1 text-sm">使用系统后会自动采集性能记录</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="shell-surface overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <span className="text-sm font-medium text-slate-700">性能记录</span>
        </div>
        <div className="divide-y divide-slate-100">
          {metrics.slice(-20).map((m) => (
            <div key={`${m.name}-${m.timestamp}`} className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="font-medium text-slate-900">{m.name}</span>
                {m.metadata && (
                  <span className="ml-2 text-sm text-slate-500">{JSON.stringify(m.metadata)}</span>
                )}
              </div>
              <div className="text-slate-500">
                {m.value.toFixed(2)}ms • {new Date(m.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ErrorTracker() {
  const errorMetrics = localMonitor.getApiMetrics().filter((m) => m.error || m.statusCode >= 400)

  if (errorMetrics.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500">
        <Bug className="mx-auto mb-4 h-12 w-12 opacity-50" />
        <p>暂无错误记录</p>
        <p className="mt-1 text-sm">出现异常时会自动进入错误追踪</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="shell-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <span className="text-sm font-medium text-slate-700">错误记录</span>
          <span className="text-sm text-red-500">{errorMetrics.length} 条</span>
        </div>
        <div className="divide-y divide-slate-100">
          {errorMetrics.slice(-20).map((m, i) => (
            <div key={i} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-red-500">
                  {m.method} {m.url}
                </span>
                <span className="text-sm text-slate-500">
                  {new Date(m.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="mt-1 text-sm text-slate-500">
                Status: {m.statusCode || 'N/A'} • Duration: {m.duration.toFixed(0)}ms
              </div>
              {m.error && <div className="mt-1 text-sm font-mono text-red-500">{m.error}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
