/**
 * DashboardCompareCard.tsx
 * 
 * Dashboard对比分析卡片 - 完整版时段对比 + 每日进度变化
 * 
 * 功能特性：
 * 1. 每日任务进度变化统计（新增）
 * 2. 时段对比分析（与TaskSummary完全一致）
 * 
 * @module
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/ui/loading-state'
import { apiGet } from '@/lib/apiClient'
import {
  TrendingUp,
  BarChart3,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Calendar,
  Activity,
  X
} from 'lucide-react'

// ─── 类型定义 ─────────────────────────────────────────────

interface DailyProgress {
  date: string
  progress_change: number  // 当日进度变化百分比总和
  tasks_updated: number     // 有进度更新的任务数
  tasks_completed: number   // 当日完成的任务数
  details: {
    task_id: string
    task_title: string
    progress_before: number
    progress_after: number
    progress_delta: number
    assignee: string
  }[]
}

interface ComparePeriod {
  label: string
  from: string
  to: string
}

type CompareGranularity = 'day' | 'week' | 'month'

interface TaskDetail {
  id: string
  title: string
  progress: number
  progress_before: number
  progress_delta: number
  assignee: string
  end_date: string
  completed_at: string
  specialty_type: string
  is_on_time: boolean
}

interface CompareResult {
  period_label: string
  from: string
  to: string
  summary: {
    total_progress_change: number  // 总进度变化
    tasks_updated: number          // 有更新的任务数
    tasks_progressed: number       // 有正向进展的任务数
    tasks_completed: number        // 完成的任务数
    total: number                  // 兼容旧字段
    on_time: number                // 兼容旧字段
    delayed: number                // 兼容旧字段
    on_time_rate: number           // 兼容旧字段
  }
  task_ids: string[]
  task_details: TaskDetail[]
}

function normalizeDailyProgress(payload: DailyProgress | null | undefined): DailyProgress | null {
  if (!payload || typeof payload !== 'object') return null

  return {
    date: String(payload.date ?? ''),
    progress_change: typeof payload.progress_change === 'number' ? payload.progress_change : 0,
    tasks_updated: typeof payload.tasks_updated === 'number' ? payload.tasks_updated : 0,
    tasks_completed: typeof payload.tasks_completed === 'number' ? payload.tasks_completed : 0,
    details: Array.isArray(payload.details) ? payload.details : [],
  }
}

function normalizeCompareResults(payload: CompareResult[] | null | undefined): CompareResult[] {
  return Array.isArray(payload) ? payload : []
}

// ─── 本地日期格式化工具 ───────────────────────────────────

const fmt = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const fmtMonth = (value: string) => value.slice(0, 7)

function buildMonthPeriod(monthValue: string) {
  const start = new Date(`${monthValue}-01T00:00:00`)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
  return {
    from: fmt(start),
    to: fmt(end),
  }
}

// ─── 每日进度变化组件 ─────────────────────────────────────

function DailyProgressSection({ projectId }: { projectId?: string }) {
  const [data, setData] = useState<DailyProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    
    // 获取今天的日期
    const today = fmt(new Date())
    
    apiGet<DailyProgress | null>(`/api/task-summaries/projects/${projectId}/daily-progress?date=${today}`)
      .then((payload) => {
        setData(normalizeDailyProgress(payload))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading) {
    return (
      <LoadingState
        label="每日进度加载中"
        description=""
        className="min-h-20"
      />
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-gray-400">
        <Activity className="w-8 h-8 mb-2 text-gray-200" />
        <p className="text-sm">今日暂无进度更新</p>
      </div>
    )
  }

  const progressColor = data.progress_change > 0 
    ? 'text-emerald-600 bg-emerald-50' 
    : data.progress_change < 0 
    ? 'text-red-600 bg-red-50' 
    : 'text-gray-600 bg-gray-50'

  return (
    <div className="space-y-3">
      {/* 核心指标卡片 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-3 border border-blue-100">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-gray-500">进度变化</span>
          </div>
          <p className={`text-2xl font-bold ${progressColor.split(' ')[0]}`}>
            {data.progress_change > 0 ? '+' : ''}{data.progress_change.toFixed(1)}%
          </p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-3 border border-emerald-100">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <span className="text-xs text-gray-500">更新任务</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{data.tasks_updated}</p>
        </div>
        <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl p-3 border border-violet-100">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-violet-500" />
            <span className="text-xs text-gray-500">完成任务</span>
          </div>
          <p className="text-2xl font-bold text-violet-600">{data.tasks_completed}</p>
        </div>
      </div>

      {/* 展开详情 */}
      {data.details.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <button
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {expanded ? '收起详情' : `查看 ${data.details.length} 个任务详情`}
          </button>
          
          {expanded && (
            <div className="mt-3 space-y-2">
              {data.details.map((d, idx) => (
                <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                  <div className="flex-1 truncate">
                    <span className="font-medium text-gray-700">{d.task_title}</span>
                    <span className="text-gray-400 text-xs ml-2">{d.assignee}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs">
                      {d.progress_before}% → {d.progress_after}%
                    </span>
                    <span className={`font-bold ${d.progress_delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {d.progress_delta > 0 ? '+' : ''}{d.progress_delta}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 完整时段对比组件（与TaskSummary完全一致）─────────────

function CompareView({ projectId }: { projectId?: string }) {
  const [granularity, setGranularity] = useState<CompareGranularity>('day')
  const [results, setResults] = useState<CompareResult[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedChange, setExpandedChange] = useState<number | null>(null)

  // 默认2个时段：根据粒度生成初始值
  const [periods, setPeriods] = useState<ComparePeriod[]>(() => {
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    return [
      { label: '昨天', from: fmt(yesterday), to: fmt(yesterday) },
      { label: '今天', from: fmt(now), to: fmt(now) },
    ]
  })

  const updatePeriod = (idx: number, field: keyof ComparePeriod, value: string) => {
    setPeriods(prev => prev.map((p, i) => {
      if (i !== idx) return p
      if (granularity === 'day' && (field === 'from' || field === 'to')) {
        return { ...p, from: value, to: value }
      }
      if (granularity === 'month' && (field === 'from' || field === 'to')) {
        if (!value) {
          return { ...p, from: '', to: '' }
        }
        return { ...p, ...buildMonthPeriod(value) }
      }
      return { ...p, [field]: value }
    }))
  }

  const addPeriod = () => {
    if (periods.length >= 10) return
    setPeriods(prev => [...prev, { label: `时段${prev.length + 1}`, from: '', to: '' }])
  }

  const removePeriod = (idx: number) => {
    if (periods.length <= 1) return
    setPeriods(prev => prev.filter((_, i) => i !== idx))
  }

  // 快捷选择
  const quickSelect = (preset: 'day1' | 'day3' | 'day7' | 'week' | 'biweek' | 'month' | 'quarter') => {
    const now = new Date()

    if (preset === 'day1') {
      const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
      setPeriods([
        { label: '昨天', from: fmt(yesterday), to: fmt(yesterday) },
        { label: '今天', from: fmt(now), to: fmt(now) },
      ])
    } else if (preset === 'day3') {
      const dayBefore = new Date(now); dayBefore.setDate(now.getDate() - 3)
      const dayBeforeBefore = new Date(now); dayBeforeBefore.setDate(now.getDate() - 4)
      setPeriods([
        { label: '大前天', from: fmt(dayBeforeBefore), to: fmt(dayBeforeBefore) },
        { label: '前天', from: fmt(dayBefore), to: fmt(dayBefore) },
      ])
    } else if (preset === 'day7') {
      const oneWeekAgo = new Date(now); oneWeekAgo.setDate(now.getDate() - 7)
      const twoWeeksAgo = new Date(now); twoWeeksAgo.setDate(now.getDate() - 14)
      setPeriods([
        { label: '上上周同日', from: fmt(twoWeeksAgo), to: fmt(twoWeeksAgo) },
        { label: '上周同日', from: fmt(oneWeekAgo), to: fmt(oneWeekAgo) },
      ])
    } else if (preset === 'week') {
      const dayOfWeek = now.getDay() || 7
      const thisMonday = new Date(now); thisMonday.setDate(now.getDate() - dayOfWeek + 1)
      const lastMonday = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate() - 7)
      const thisSunday = new Date(thisMonday); thisSunday.setDate(thisMonday.getDate() + 6)
      const lastSunday = new Date(lastMonday); lastSunday.setDate(lastMonday.getDate() + 6)
      setPeriods([
        { label: '上周', from: fmt(lastMonday), to: fmt(lastSunday) },
        { label: '本周', from: fmt(thisMonday), to: fmt(thisSunday) },
      ])
    } else if (preset === 'biweek') {
      const twoWeeksAgo = new Date(now); twoWeeksAgo.setDate(now.getDate() - 14)
      const fourWeeksAgo = new Date(now); fourWeeksAgo.setDate(now.getDate() - 28)
      setPeriods([
        { label: '前两周', from: fmt(fourWeeksAgo), to: fmt(twoWeeksAgo) },
        { label: '近两周', from: fmt(twoWeeksAgo), to: fmt(now) },
      ])
    } else if (preset === 'month') {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const lastMonthFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastMonthLast = new Date(now.getFullYear(), now.getMonth(), 0)
      setPeriods([
        { label: '上月', from: fmt(lastMonthFirst), to: fmt(lastMonthLast) },
        { label: '本月', from: fmt(firstOfMonth), to: fmt(now) },
      ])
    } else if (preset === 'quarter') {
      const currentQuarterStartMonth = Math.floor(now.getMonth() / 3) * 3
      const thisQuarterStart = new Date(now.getFullYear(), currentQuarterStartMonth, 1)
      const prevQuarterStart = new Date(now.getFullYear(), currentQuarterStartMonth - 3, 1)
      const prevQuarterEnd = new Date(now.getFullYear(), currentQuarterStartMonth, 0)
      setPeriods([
        { label: '上季度', from: fmt(prevQuarterStart), to: fmt(prevQuarterEnd) },
        { label: '本季度', from: fmt(thisQuarterStart), to: fmt(now) },
      ])
    }
  }

  // 快捷选择只显示2个选项
  const quickOptions = granularity === 'day'
    ? [
        { key: 'day1' as const, label: '今昨对比' },
        { key: 'day7' as const, label: '周同比' },
      ]
    : granularity === 'week'
      ? [
          { key: 'week' as const, label: '周环比' },
          { key: 'biweek' as const, label: '双周对比' },
        ]
      : [
          { key: 'month' as const, label: '月环比' },
          { key: 'quarter' as const, label: '季度对比' },
        ]

  const runCompare = () => {
    const validPeriods = periods.filter(p => p.from && p.to && p.label)
    if (!validPeriods.length || !projectId) return
    setLoading(true)
    setExpandedChange(null)
    const params = new URLSearchParams({
      periods: JSON.stringify(validPeriods),
      granularity,
    })
    apiGet<CompareResult[]>(`/api/task-summaries/projects/${projectId}/task-summary/compare?${params}`)
      .then((data) => {
        setResults(normalizeCompareResults(data))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  // 计算相邻时段之间的进度变化差异
  const changes = results.slice(1).map((current, idx) => {
    const prev = results[idx]
    const prevDetails = prev?.task_details || []
    const currDetails = current?.task_details || []

    // 计算进度变化的差异
    const prevProgress = prev?.summary?.total_progress_change || 0
    const currProgress = current?.summary?.total_progress_change || 0
    const progressDelta = currProgress - prevProgress

    // 找出两个时段都有进展的任务
    const currIdSet = new Set(currDetails.map(t => t.id))
    const tasksWithProgress = currDetails.filter(t => t.progress_delta > 0)

    return {
      from_label: prev?.period_label || '',
      to_label: current?.period_label || '',
      from_date: `${(prev?.from || '').slice(5)} ~ ${(prev?.to || '').slice(5)}`,
      to_date: `${(current?.from || '').slice(5)} ~ ${(current?.to || '').slice(5)}`,
      prev_total: prevProgress,
      curr_total: currProgress,
      delta: progressDelta,
      new_tasks: tasksWithProgress,
    }
  })

  return (
    <div className="space-y-4">
      {/* 时段配置 */}
      <div className="space-y-3">
        {/* 快捷选择 */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">快捷选择：</span>
          {quickOptions.map(opt => (
            <button key={opt.key} className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
              onClick={() => quickSelect(opt.key)}>{opt.label}</button>
          ))}
        </div>

        {/* 粒度切换 */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">粒度：</span>
          <div className="flex items-center gap-1 border rounded-lg overflow-hidden">
            <button className={`px-3 py-1.5 text-xs transition-colors ${granularity === 'day' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              onClick={() => { setGranularity('day'); quickSelect('day1') }}>按天</button>
            <button className={`px-3 py-1.5 text-xs transition-colors ${granularity === 'week' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              onClick={() => { setGranularity('week'); quickSelect('week') }}>按周</button>
            <button className={`px-3 py-1.5 text-xs transition-colors ${granularity === 'month' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              onClick={() => { setGranularity('month'); quickSelect('month') }}>按月</button>
          </div>
        </div>

        {/* 时段列表 */}
        <div className="space-y-2">
          {periods.map((p, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input type="text" value={p.label} placeholder="名称"
                onChange={e => updatePeriod(idx, 'label', e.target.value)}
                className="w-20 px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none" />
              {granularity === 'day' ? (
                <input type="date" value={p.from} onChange={e => updatePeriod(idx, 'from', e.target.value)}
                  className="px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none [::-webkit-calendar-picker-indicator]:opacity-60" />
              ) : granularity === 'month' ? (
                <input type="month" value={p.from ? fmtMonth(p.from) : ''} onChange={e => updatePeriod(idx, 'from', e.target.value)}
                  className="px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none" />
              ) : (
                <>
                  <input type="date" value={p.from} onChange={e => updatePeriod(idx, 'from', e.target.value)}
                    className="px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none [::-webkit-calendar-picker-indicator]:opacity-60" />
                  <span className="text-gray-400 text-sm">至</span>
                  <input type="date" value={p.to} onChange={e => updatePeriod(idx, 'to', e.target.value)}
                    className="px-2 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none [::-webkit-calendar-picker-indicator]:opacity-60" />
                </>
              )}
              {periods.length > 1 && (
                <button className="text-gray-400 hover:text-red-500 transition-colors p-1" onClick={() => removePeriod(idx)}>
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
            onClick={addPeriod}>
            + 添加时段
          </button>
          <Button size="sm" loading={loading} onClick={runCompare}
            className="bg-blue-600 hover:bg-blue-700 text-white">
            <BarChart3 className="w-4 h-4 mr-1.5" />
            开始对比
          </Button>
        </div>
      </div>

      {/* 对比结果 */}
      {loading && (
        <LoadingState
          label="时间段对比加载中"
          description=""
          className="h-32 min-h-32"
        />
      )}

      {results.length > 0 && !loading && (
        <div className="space-y-3">
          {/* 各时段进度变化概况 - 竖向紧凑排列 */}
          <div className="space-y-2">
            {results.map((r, idx) => {
              const progressChange = r.summary?.total_progress_change ?? 0
              const tasksUpdated = r.summary?.tasks_updated ?? 0
              const tasksProgressed = r.summary?.tasks_progressed ?? 0
              const changeColor = progressChange > 0
                ? 'text-emerald-600'
                : progressChange < 0
                  ? 'text-red-600'
                  : 'text-gray-600'
              const changeSign = progressChange > 0 ? '+' : ''
              return (
                <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-100 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{r.period_label}</p>
                    <p className="text-xs text-gray-400">
                      {granularity === 'month' ? fmtMonth(r.from) : `${r.from.slice(5)} ~ ${r.to.slice(5)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <p className={`text-xl font-bold ${changeColor}`}>
                        {changeSign}{progressChange.toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-500">进度变化</p>
                    </div>
                    <div className="text-xs">
                      <p className="text-blue-600 font-medium">{tasksUpdated} 任务</p>
                      <p className="text-emerald-600">{tasksProgressed} 进展</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 变化量对比区 - 精简显示 */}
          {changes.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-blue-500" />进度变化对比
              </h4>
              {changes.map((c, idx) => {
                const isExpanded = expandedChange === idx
                const netColor = c.delta > 0 ? 'text-emerald-600' : c.delta < 0 ? 'text-red-600' : 'text-gray-500'
                const netBg = c.delta > 0 ? 'bg-emerald-50' : c.delta < 0 ? 'bg-red-50' : 'bg-gray-50'
                const netSign = c.delta > 0 ? '+' : ''
                return (
                  <div key={idx} className={`rounded-lg border p-3 ${netBg} border-gray-100`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">
                          {c.from_label} → {c.to_label}
                        </p>
                        <p className="text-xs text-gray-400">
                          {c.prev_total?.toFixed(1) || '0'}% → {c.curr_total?.toFixed(1) || '0'}%
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-lg font-bold ${netColor}`}>{netSign}{c.delta?.toFixed(1) || '0'}%</p>
                        <p className="text-xs text-gray-500">净变化</p>
                      </div>
                    </div>

                    {(c.new_tasks && c.new_tasks.length > 0) && (
                      <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
                        <span className="text-blue-600">
                          {c.new_tasks.length} 个任务有进展
                        </span>
                        {c.new_tasks.length > 0 && (
                          <button className="text-blue-600 hover:text-blue-700 ml-auto"
                            onClick={() => setExpandedChange(isExpanded ? null : idx)}>
                            {isExpanded ? '收起' : '详情'}
                          </button>
                        )}
                      </div>
                    )}

                    {isExpanded && c.new_tasks && c.new_tasks.length > 0 && (
                      <div className="mt-2 border-t border-gray-200 pt-2 space-y-1.5">
                        {c.new_tasks.map(t => (
                          <div key={t.id} className="flex items-center justify-between text-xs bg-white/60 rounded px-2 py-1.5">
                            <span className="font-medium text-gray-700 truncate max-w-[120px]" title={t.title}>{t.title}</span>
                            <span className={`shrink-0 ${t.progress_delta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {t.progress_delta > 0 ? '+' : ''}{t.progress_delta}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {results.length === 1 && <div className="py-2" />}
        </div>
      )}

      {!loading && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
          <BarChart3 className="w-10 h-10 mb-2 text-gray-200" />
        </div>
      )}
    </div>
  )
}

// ─── 主组件 ──────────────────────────────────────────────

interface DashboardCompareCardProps {
  projectId?: string
}

export default function DashboardCompareCard({ projectId }: DashboardCompareCardProps) {
  const [activeTab, setActiveTab] = useState<'daily' | 'compare'>('daily')

  return (
    <Card className="border-gray-100 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            对比分析
          </CardTitle>
          
          {/* Tab 切换 */}
          <div className="flex items-center gap-1 border rounded-lg overflow-hidden">
            <button
              className={`flex items-center gap-1 px-3 py-1.5 text-xs transition-colors ${activeTab === 'daily' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              onClick={() => setActiveTab('daily')}
            >
              <Calendar className="w-3.5 h-3.5" />
              每日进度
            </button>
            <button
              className={`flex items-center gap-1 px-3 py-1.5 text-xs transition-colors ${activeTab === 'compare' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              onClick={() => setActiveTab('compare')}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              时段对比
            </button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {activeTab === 'daily' ? (
          <DailyProgressSection projectId={projectId} />
        ) : (
          <CompareView projectId={projectId} />
        )}
      </CardContent>
    </Card>
  )
}
