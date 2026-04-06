// 任务完成总结页面（项目级）- 16项全量优化版

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useTabPersist } from '@/hooks/useTabPersist'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import { useStore } from '@/hooks/useStore'
import { PageHeader } from '@/components/PageHeader'
import { Breadcrumb } from '@/components/Breadcrumb'
import {
  buildTaskTimelineDetailSnapshot,
  summarizeTaskTimeline,
  type TaskTimelineEvent,
} from '@/lib/taskTimeline'
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  FileText,
  CheckSquare,
  TrendingUp,
  Users,
  BarChart3,
  Sparkles,
  ExternalLink,
  AlertTriangle,
  Clock,
  Building2,
  Layers,
} from 'lucide-react'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

// ─── 类型 ─────────────────────────────────────────────────

interface DelayRecord {
  id: string
  delay_days: number
  reason: string
  recorded_at: string
}

interface CompletedTask {
  id: string
  title: string
  assignee?: string
  building?: string
  section?: string
  completed_at: string
  planned_end_date: string
  actual_duration?: number
  planned_duration?: number
  subtask_total: number
  subtask_on_time: number
  subtask_delayed: number
  delay_total_days: number
  delay_records: DelayRecord[]
  status_label: 'on_time' | 'delayed'
  confirmed?: boolean
}

interface MilestoneGroup {
  id: string
  name: string
  status: 'completed' | 'in_progress' | 'pending'
  completed_at?: string
  planned_end_date?: string
  tasks: CompletedTask[]
}

interface ProjectSummaryStats {
  total_completed: number
  on_time_count: number
  delayed_count: number
  completed_milestone_count: number
  avg_delay_days?: number
}

// ─── SVG 环形进度圈 ────────────────────────────────────────

function RingProgress({ rate, size = 72, stroke = 8, color = '#10b981' }: {
  rate: number; size?: number; stroke?: number; color?: string
}) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (rate / 100) * circ
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  )
}

// ─── 骨架屏 ──────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="w-5 h-5 bg-gray-200 rounded animate-pulse" />
          <div className="w-10 h-4 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="w-16 h-8 bg-gray-200 rounded animate-pulse mb-2" />
        <div className="w-20 h-3 bg-gray-200 rounded animate-pulse" />
      </CardContent>
    </Card>
  )
}

function TaskCardSkeleton() {
  return (
    <div className="card-v4 !p-5 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="w-48 h-4 bg-gray-200 rounded mb-2" />
          <div className="w-32 h-3 bg-gray-100 rounded" />
        </div>
        <div className="w-16 h-5 bg-gray-200 rounded-full" />
      </div>
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-gray-100 p-3 rounded-lg text-center">
            <div className="w-8 h-6 bg-gray-200 rounded mx-auto mb-1" />
            <div className="w-12 h-3 bg-gray-100 rounded mx-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}

interface TrendRow {
  month: string
  total: number
  on_time: number
  delayed: number
}

interface AssigneeRow {
  assignee: string
  total: number
  on_time: number
  delayed: number
  on_time_rate: number
}

// 按楼栋/分部分组结构
type GroupMode = 'milestone' | 'building' | 'section'

// ─── 任务详情弹窗 ─────────────────────────────────────────

function formatTimelineTime(value: string) {
  if (!value) return '时间未知'
  return new Date(value).toLocaleString('zh-CN')
}

function TaskDetailDialog({ task, taskEvents, projectId, open, onClose }: {
  task: CompletedTask | null
  taskEvents: TaskTimelineEvent[]
  projectId?: string
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  if (!task) return null
  const durationDiff = task.actual_duration != null && task.planned_duration != null
    ? task.actual_duration - task.planned_duration : null
  const taskTimelineSnapshot = buildTaskTimelineDetailSnapshot(
    taskEvents,
    task.id,
    task.title,
  )
  const taskTimelineSummary = taskTimelineSnapshot.taskSummary
  const taskTimelineNarrative = taskTimelineSnapshot.narrative
  const latestEvent = taskTimelineSnapshot.taskEvents[0]
  const earliestEvent = taskTimelineSnapshot.taskEvents[taskTimelineSnapshot.taskEvents.length - 1]
  const kindStyles: Record<string, { badge: string; dot: string; label: string }> = {
    task: { badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500', label: '任务状态' },
    milestone: { badge: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500', label: '里程碑' },
    condition: { badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', label: '开工条件' },
    obstacle: { badge: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500', label: '阻碍' },
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4 text-blue-500" />任务详情
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <h3 className="font-semibold text-gray-900 text-base">{task.title}</h3>
            {task.assignee && <p className="text-sm text-gray-500 mt-1">责任人：{task.assignee}</p>}
          </div>
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <h4 className="text-sm font-medium text-gray-700">工期对比</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-800">
                  {task.planned_duration != null ? `${task.planned_duration}天` : '—'}
                </p>
                <p className="text-xs text-gray-500">计划工期</p>
              </div>
              <div className="text-center">
                <p className={`text-2xl font-bold ${durationDiff != null && durationDiff > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {task.actual_duration != null ? `${task.actual_duration}天` : '—'}
                </p>
                <p className="text-xs text-gray-500">实际工期</p>
              </div>
            </div>
            {durationDiff != null && (
              <p className={`text-center text-sm font-medium ${durationDiff > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {durationDiff > 0 ? `超期 ${durationDiff} 天` : durationDiff < 0 ? `提前 ${-durationDiff} 天` : '准时完成'}
              </p>
            )}
          </div>
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-medium text-gray-700">任务历程</h4>
              <Badge variant="secondary">{taskTimelineSummary.total} 条事实</Badge>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-lg bg-white p-2">
                <p className="text-lg font-semibold text-gray-800">{taskTimelineSummary.taskCount}</p>
                <p className="text-[11px] text-gray-500">任务状态</p>
              </div>
              <div className="rounded-lg bg-white p-2">
                <p className="text-lg font-semibold text-violet-700">{taskTimelineSummary.milestoneCount}</p>
                <p className="text-[11px] text-gray-500">里程碑</p>
              </div>
              <div className="rounded-lg bg-white p-2">
                <p className="text-lg font-semibold text-amber-700">{taskTimelineSummary.conditionCount}</p>
                <p className="text-[11px] text-gray-500">条件</p>
              </div>
              <div className="rounded-lg bg-white p-2">
                <p className="text-lg font-semibold text-rose-700">{taskTimelineSummary.obstacleCount}</p>
                <p className="text-[11px] text-gray-500">阻碍</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              {taskTimelineSummary.total > 0
                ? `起始于 ${formatTimelineTime(earliestEvent?.occurredAt || '')}，最近变化 ${formatTimelineTime(latestEvent?.occurredAt || '')}`
                : '暂无可展示的任务历程'}
            </p>
            {taskTimelineSnapshot.taskEvents.length > 0 ? (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {taskTimelineSnapshot.taskEvents.slice(0, 6).map((event) => {
                  const style = kindStyles[event.kind] ?? kindStyles.task
                  return (
                    <div key={event.id} className="flex gap-3 rounded-lg border border-slate-100 bg-white p-3">
                      <div className={`mt-1 h-2.5 w-2.5 rounded-full ${style.dot}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className={`text-xs ${style.badge}`}>{style.label}</Badge>
                          <span className="font-medium text-gray-800 truncate">{event.title}</span>
                          <span className="text-xs text-gray-400">{formatTimelineTime(event.occurredAt)}</span>
                        </div>
                        <p className="mt-1 text-sm text-gray-600">{event.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-gray-500">
                当前任务没有额外的历程事实可以展示
              </div>
            )}
          </div>
          <div className="bg-emerald-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-medium text-gray-700">自动总结</h4>
              <Badge variant="secondary">{taskTimelineNarrative.summaryLines.length + 1} 段要点</Badge>
            </div>
            <p className="text-sm font-medium text-gray-900">{taskTimelineNarrative.headline}</p>
            <div className="space-y-2">
              {taskTimelineNarrative.summaryLines.map((line) => (
                <p key={line} className="text-sm text-gray-700 leading-relaxed">{line}</p>
              ))}
            </div>
            <p className="text-xs text-gray-500">{taskTimelineNarrative.supplementalLine}</p>
          </div>
          {task.subtask_total > 0 && (
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">子任务完成率</span>
                <span className="font-medium">{task.subtask_on_time}/{task.subtask_total}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-400 rounded-full"
                  style={{ width: `${Math.round((task.subtask_on_time / task.subtask_total) * 100)}%` }} />
              </div>
            </div>
          )}
          {task.delay_records.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">延期记录（{task.delay_records.length}条）</h4>
              <div className="space-y-2 max-h-36 overflow-y-auto">
                {task.delay_records.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg text-sm">
                    <span className="font-medium text-amber-700 whitespace-nowrap">延期{d.delay_days}天</span>
                    <span className="text-gray-600 truncate">{d.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-2 border-t">
            {projectId && (
              <Button variant="outline" size="sm" className="flex-1"
                onClick={() => { navigate(`/projects/${projectId}/gantt?highlight=${task.id}`); onClose() }}>
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />在任务列表中定位
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── 任务卡片 ─────────────────────────────────────────────

function TaskCard({ task, projectId, highlighted, onOpenDetail, selectable, selected, onSelect }: {
  task: CompletedTask; projectId?: string; highlighted?: boolean; onOpenDetail: (t: CompletedTask) => void
  selectable?: boolean; selected?: boolean; onSelect?: (id: string) => void
}) {
  const [delayOpen, setDelayOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <div id={`task-card-${task.id}`}
      className={`card-v4 !p-5 transition-all duration-200 ${highlighted ? 'ring-2 ring-orange-400 ring-offset-2' : ''} ${selected ? 'ring-2 ring-blue-400 ring-offset-1 bg-blue-50/40' : ''}`}>
      <div className="flex items-start gap-3 mb-3">
        {selectable && (
          <input type="checkbox" checked={!!selected} onChange={() => onSelect?.(task.id)}
            className="mt-1 w-4 h-4 rounded accent-blue-500 flex-shrink-0 cursor-pointer" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <button className="font-semibold text-gray-800 text-left hover:text-blue-600 transition-colors truncate max-w-xs"
                onClick={() => onOpenDetail(task)}>{task.title}</button>
              <p className="text-sm text-gray-500 mt-0.5">
                完成时间: {task.completed_at}{task.assignee && ` | 责任人: ${task.assignee}`}
                {task.building && ` | ${task.building}`}{task.section && ` / ${task.section}`}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              {task.confirmed && <Badge className="bg-blue-100 text-blue-600 hover:bg-blue-100 text-xs">已确认</Badge>}
              {task.status_label === 'on_time'
                ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">按时完成</Badge>
                : <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">延期完成</Badge>}
              {projectId && (
                <button onClick={() => navigate(`/projects/${projectId}/gantt?highlight=${task.id}`)}
                  className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                  </svg>
                  定位
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { v: task.subtask_total, l: '子任务数', c: 'text-gray-800' },
          { v: task.subtask_on_time, l: '按时完成', c: 'text-green-600' },
          { v: task.subtask_delayed, l: '延期完成', c: task.subtask_delayed > 0 ? 'text-yellow-600' : 'text-gray-400' },
          { v: task.actual_duration != null ? `${task.actual_duration}天` : '—', l: '实际工期', c: 'text-gray-800' },
        ].map(({ v, l, c }) => (
          <div key={l} className="bg-gray-50 p-3 rounded-lg text-center">
            <p className={`text-xl font-bold ${c}`}>{v}</p>
            <p className="text-xs text-gray-500">{l}</p>
          </div>
        ))}
      </div>
      {task.delay_records.length > 0 && (
        <div className="border-t pt-3">
          <button className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            onClick={() => setDelayOpen(!delayOpen)}>
            {delayOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            查看延期记录（{task.delay_records.length}条）
          </button>
          {delayOpen && (
            <div className="mt-2 space-y-2">
              {task.delay_records.map((d) => (
                <div key={d.id} className="p-2 bg-yellow-50 rounded-lg text-sm flex items-center gap-2">
                  <span className="font-medium text-yellow-700">延期{d.delay_days}天</span>
                  <span className="text-gray-600">{d.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MilestoneSection({ group, projectId, highlightTaskId, onOpenDetail, selectable, selectedIds, onSelect }: {
  group: MilestoneGroup; projectId?: string; highlightTaskId?: string | null; onOpenDetail: (t: CompletedTask) => void
  selectable?: boolean; selectedIds?: Set<string>; onSelect?: (id: string) => void
}) {
  const dotColor = group.status === 'completed' ? 'bg-emerald-500' : group.status === 'in_progress' ? 'bg-blue-400' : 'bg-gray-300'
  const labelMap = { completed: 'bg-emerald-100 text-emerald-700', in_progress: 'bg-blue-100 text-blue-700', pending: 'bg-gray-100 text-gray-600' }
  const textMap = { completed: '里程碑已完成', in_progress: '里程碑进行中', pending: '里程碑未开始' }
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-3 h-3 rounded-full ${dotColor}`} />
        <h2 className="font-semibold text-gray-800">{group.name}</h2>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${labelMap[group.status]}`}>{textMap[group.status]}</span>
        {group.completed_at && <span className="text-sm text-gray-500">完成时间: {group.completed_at}</span>}
        <span className="text-xs text-gray-400">{group.tasks.length} 项任务</span>
      </div>
      <div className="pl-6 space-y-3">
        {group.tasks.length > 0 ? (
          group.tasks.map((task) => (
            <TaskCard key={task.id} task={task} projectId={projectId} highlighted={highlightTaskId === task.id}
              onOpenDetail={onOpenDetail} selectable={selectable} selected={selectedIds?.has(task.id)} onSelect={onSelect} />
          ))
        ) : (
          <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-8 text-center">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">该阶段暂无已完成任务</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 趋势图组件 ───────────────────────────────────────────

function TrendChart({ projectId }: { projectId?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const [data, setData] = useState<TrendRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    fetch(`/api/task-summaries/projects/${projectId}/task-summary/trend`)
      .then(r => r.json()).then(j => { if (j.success) setData(j.data || []) })
      .catch(console.error).finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => {
    if (loading || !canvasRef.current) return
    chartRef.current?.destroy()
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: data.map(r => r.month),
        datasets: [
          { label: '按时完成', data: data.map(r => r.on_time), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)', fill: true, tension: 0.4, pointRadius: 5 },
          { label: '延期完成', data: data.map(r => r.delayed), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)', fill: true, tension: 0.4, pointRadius: 5 },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' }, tooltip: { mode: 'index', intersect: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } },
    })
    return () => { chartRef.current?.destroy() }
  }, [data, loading])

  if (loading) return <div className="flex items-center justify-center h-48 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin mr-2" />加载中...</div>

  return (
    <div>
      <p className="text-sm text-gray-400 mb-4">近6个月按时 vs 延期完成趋势</p>
      {data.length > 0 ? (
        <div className="relative h-64"><canvas ref={canvasRef} /></div>
      ) : (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <TrendingUp className="w-10 h-10 mb-2 text-gray-200" />
          <p className="text-sm">暂无近6个月趋势数据</p>
        </div>
      )}
    </div>
  )
}

// ─── 责任人图 ─────────────────────────────────────────────

function AssigneeChart({ projectId }: { projectId?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const [data, setData] = useState<AssigneeRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    fetch(`/api/task-summaries/projects/${projectId}/task-summary/assignees`)
      .then(r => r.json()).then(j => { if (j.success) setData(j.data || []) })
      .catch(console.error).finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => {
    if (loading || !canvasRef.current || !data.length) return
    chartRef.current?.destroy()
    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: data.map(r => r.assignee),
        datasets: [
          { label: '按时完成', data: data.map(r => r.on_time), backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 4 },
          { label: '延期完成', data: data.map(r => r.delayed), backgroundColor: 'rgba(245,158,11,0.7)', borderRadius: 4 },
        ],
      },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' }, tooltip: { mode: 'index', intersect: false } }, scales: { x: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } }, y: { stacked: true } } },
    })
    return () => { chartRef.current?.destroy() }
  }, [data, loading])

  if (loading) return <div className="flex items-center justify-center h-48 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin mr-2" />加载中...</div>
  if (!data.length) return <div className="flex flex-col items-center justify-center h-48 text-gray-400"><Users className="w-10 h-10 mb-2 text-gray-200" /><p className="text-sm">暂无责任人数据</p></div>
  return (
    <div className="space-y-4">
      <div className="relative" style={{ height: `${Math.max(200, data.length * 44)}px` }}><canvas ref={canvasRef} /></div>
      <div className="border-t pt-4 space-y-2">
        <p className="text-sm font-medium text-gray-600 mb-3">按时完成率</p>
        {data.map(r => (
          <div key={r.assignee} className="flex items-center gap-3">
            <span className="text-sm text-gray-700 w-20 truncate flex-shrink-0">{r.assignee}</span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${r.on_time_rate >= 80 ? 'bg-emerald-400' : r.on_time_rate >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
                style={{ width: `${r.on_time_rate}%` }} />
            </div>
            <span className="text-sm font-medium text-gray-600 w-10 text-right flex-shrink-0">{r.on_time_rate}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── AI 报告 ──────────────────────────────────────────────

function AIReport({ stats, groups, assigneeData }: { stats: ProjectSummaryStats | null; groups: MilestoneGroup[]; assigneeData: AssigneeRow[] }) {
  const [report, setReport] = useState('')
  const [generated, setGenerated] = useState(false)

  const generate = () => {
    if (!stats) return
    const rate = stats.total_completed > 0 ? Math.round((stats.on_time_count / stats.total_completed) * 100) : 0
    const top = [...assigneeData].sort((a, b) => b.on_time_rate - a.on_time_rate).slice(0, 3)
    const bot = [...assigneeData].sort((a, b) => a.on_time_rate - b.on_time_rate).filter(r => r.on_time_rate < 70).slice(0, 2)
    const done = groups.filter(g => g.status === 'completed')
    const wip = groups.filter(g => g.status === 'in_progress')
    const lines = [
      `## 项目任务完成总结报告\n`,
      `### 一、总体完成情况`,
      `本项目截至当前共完成任务 **${stats.total_completed}** 项，其中按时完成 **${stats.on_time_count}** 项，延期完成 **${stats.delayed_count}** 项，整体按时完成率为 **${rate}%**。`,
      rate >= 80 ? `任务整体完成质量较好，按时完成率处于良好水平。` : rate >= 60 ? `任务完成按时率有待提升，建议重点关注延期原因并加强进度管控。` : `任务延期比例较高，需要深入分析延期原因，制定针对性改进措施。`,
      ``,
      `### 二、里程碑完成情况`,
      `已完成里程碑 **${stats.completed_milestone_count}** 个${done.length > 0 ? `（${done.map(g => g.name).join('、')}）` : ''}。${wip.length > 0 ? `当前进行中里程碑：${wip.map(g => g.name).join('、')}。` : ''}`,
      ``,
    ]
    if (assigneeData.length > 0) {
      lines.push(`### 三、责任人绩效`)
      if (top.length > 0) lines.push(`**按时完成率较高：** ${top.map(a => `${a.assignee}（${a.on_time_rate}%）`).join('、')}，建议总结经验供团队分享。`)
      if (bot.length > 0) lines.push(`**需重点关注：** ${bot.map(a => `${a.assignee}（${a.on_time_rate}%）`).join('、')}，建议了解执行困难并提供支持。`)
      lines.push(``)
    }
    lines.push(`### 四、改进建议`)
    if (stats.delayed_count > 0) lines.push(`1. 针对 ${stats.delayed_count} 项延期任务，建议逐项复盘延期原因，归类分析是否存在系统性问题。`)
    lines.push(`2. 加强任务前置条件确认，确保资源和审批提前到位，避免执行阶段的被动等待。`)
    lines.push(`3. 建立定期进度跟踪机制，对即将到期任务进行提前预警，减少延期发生率。`)
    if (rate >= 80) lines.push(`4. 当前项目执行情况良好，建议将成功经验沉淀为标准作业流程。`)
    setReport(lines.join('\n'))
    setGenerated(true)
  }

  if (!generated) return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-violet-200 flex items-center justify-center">
        <Sparkles className="w-8 h-8 text-violet-500" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-gray-700 mb-1">AI 智能分析报告</h3>
        <p className="text-sm text-gray-500">基于项目完成数据，自动生成总结分析</p>
      </div>
      <Button onClick={generate} className="bg-violet-600 hover:bg-violet-700 text-white">
        <Sparkles className="w-4 h-4 mr-2" />生成分析报告
      </Button>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-500" />
          <span className="text-sm font-medium text-gray-700">AI 生成报告</span>
          <Badge className="bg-violet-100 text-violet-700 text-xs">自动生成</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setGenerated(false)}>重新生成</Button>
      </div>
      <div className="bg-gray-50 rounded-xl p-5 space-y-2">
        {report.split('\n').map((line, i) => {
          if (line.startsWith('## ')) return <h2 key={i} className="text-base font-bold text-gray-900">{line.slice(3)}</h2>
          if (line.startsWith('### ')) return <h3 key={i} className="text-sm font-semibold text-gray-800 mt-3">{line.slice(4)}</h3>
          if (line === '') return <div key={i} className="h-1" />
          return <p key={i} className="text-sm text-gray-700 leading-relaxed">{line.replace(/\*\*(.*?)\*\*/g, (_, m) => m)}</p>
        })}
      </div>
    </div>
  )
}

// ─── 主组件 ───────────────────────────────────────────────

function TaskTimelinePanel({ events }: { events: TaskTimelineEvent[] }) {
  const summary = summarizeTaskTimeline(events)

  const kindStyles: Record<string, { badge: string; dot: string; label: string }> = {
    task: { badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500', label: '任务状态' },
    milestone: { badge: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500', label: '里程碑' },
    condition: { badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', label: '开工条件' },
    obstacle: { badge: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500', label: '阻碍' },
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-500" />
          任务时间线
          <Badge variant="secondary" className="ml-1">{summary.total} 条事实</Badge>
        </CardTitle>
        <p className="text-sm text-gray-500">
          仅基于任务状态、进度、开工条件、阻碍和里程碑变化生成，不新增人工录入。
        </p>
      </CardHeader>
      <CardContent>
        {events.length > 0 ? (
          <div className="space-y-3">
            {events.slice(0, 8).map((event) => {
              const style = kindStyles[event.kind] ?? kindStyles.task
              return (
                <div key={event.id} className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                  <div className={`mt-1 h-2.5 w-2.5 rounded-full ${style.dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}>{style.label}</span>
                      <span className="font-medium text-gray-800 truncate">{event.title}</span>
                      <span className="text-xs text-gray-400">
                        {event.occurredAt ? new Date(event.occurredAt).toLocaleString('zh-CN') : '时间未知'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{event.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-gray-400">
            <Clock className="w-10 h-10 mb-2 text-gray-200" />
            <p className="text-sm">暂无可展示的时间线事实</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function TaskSummary() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { currentProject } = useStore()

  const highlightTaskId = new URLSearchParams(location.search).get('highlight') || null
  const [stats, setStats] = useState<ProjectSummaryStats | null>(null)
  const [groups, setGroups] = useState<MilestoneGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useTabPersist('task-summary', 'tasks')

  // 筛选条件
  const [filterType, setFilterType] = useState<'all' | 'milestone' | 'normal'>('all')
  const [filterMilestone, setFilterMilestone] = useState<string>('all')
  const [filterAssignee, setFilterAssignee] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // 分组模式
  const [groupMode, setGroupMode] = useState<GroupMode>('milestone')

  const [detailTask, setDetailTask] = useState<CompletedTask | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [assigneeData, setAssigneeData] = useState<AssigneeRow[]>([])
  const [persistedTimelineEvents, setPersistedTimelineEvents] = useState<TaskTimelineEvent[]>([])

  const timelineEvents = persistedTimelineEvents

  const loadData = useCallback(async () => {
    if (!projectId) return
    try {
      setLoading(true)
      setPersistedTimelineEvents([])
      const params = new URLSearchParams()
      if (filterType !== 'all') params.set('type', filterType)
      if (filterMilestone !== 'all') params.set('milestone_id', filterMilestone)
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      const res = await fetch(`/api/task-summaries/projects/${projectId}/task-summary?${params}`)
      if (!res.ok) throw new Error('加载失败')
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message || '加载失败')
      const data = json.data || {}
      setStats(data.stats || null)
      setGroups(data.groups || [])
      setPersistedTimelineEvents(Array.isArray(data.timeline_events) ? data.timeline_events : [])
    } catch (err) {
      console.error(err)
      toast({ title: '加载失败', description: '无法加载任务完成总结', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [projectId, filterType, filterMilestone, dateFrom, dateTo])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (!projectId) return
    fetch(`/api/task-summaries/projects/${projectId}/task-summary/assignees`)
      .then(r => r.json()).then(j => { if (j.success) setAssigneeData(j.data || []) }).catch(console.error)
  }, [projectId])

  useEffect(() => {
    if (!highlightTaskId || loading) return
    const t = setTimeout(() => {
      const el = document.getElementById(`task-card-${highlightTaskId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('ring-2', 'ring-orange-400', 'ring-offset-2')
        setTimeout(() => el.classList.remove('ring-2', 'ring-orange-400', 'ring-offset-2'), 3000)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [highlightTaskId, loading])

  const handleReset = () => {
    setFilterType('all'); setFilterMilestone('all'); setFilterAssignee('all')
    setDateFrom(''); setDateTo('')
  }

  // 获取所有任务（扁平化）
  const allTasks = groups.flatMap(g => g.tasks)

  // 获取所有不重复责任人
  const allAssignees = Array.from(new Set(allTasks.map(t => t.assignee).filter(Boolean) as string[])).sort()

  // 按责任人前端过滤 + 按楼栋/分部分组
  const filteredGroups: MilestoneGroup[] = groups.map(g => ({
    ...g,
    tasks: g.tasks.filter(t => filterAssignee === 'all' || t.assignee === filterAssignee)
  }))

  // 按楼栋分组
  const buildingGroups: MilestoneGroup[] = (() => {
    const map = new Map<string, CompletedTask[]>()
    allTasks
      .filter(t => filterAssignee === 'all' || t.assignee === filterAssignee)
      .forEach(t => {
        const key = t.building || '未分配楼栋'
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(t)
      })
    return Array.from(map.entries()).map(([name, tasks]) => ({
      id: name, name, status: 'completed' as const, tasks
    }))
  })()

  // 按分部分组
  const sectionGroups: MilestoneGroup[] = (() => {
    const map = new Map<string, CompletedTask[]>()
    allTasks
      .filter(t => filterAssignee === 'all' || t.assignee === filterAssignee)
      .forEach(t => {
        const key = t.section || '未分配分部'
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(t)
      })
    return Array.from(map.entries()).map(([name, tasks]) => ({
      id: name, name, status: 'completed' as const, tasks
    }))
  })()

  const displayGroups = groupMode === 'building' ? buildingGroups
    : groupMode === 'section' ? sectionGroups : filteredGroups

  const onTimeRate = stats && stats.total_completed > 0
    ? Math.round((stats.on_time_count / stats.total_completed) * 100) : 0

  const delayRate = 100 - onTimeRate

  // ─── 骨架屏 ─────────────────────────────────
  if (loading) return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <div className="h-5 w-64 bg-gray-200 rounded animate-pulse" />
      <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
      {/* 统计卡骨架 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => <StatCardSkeleton key={i} />)}
      </div>
      {/* 筛选骨架 */}
      <div className="h-14 bg-gray-100 rounded-xl animate-pulse" />
      {/* 任务骨架 */}
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => <TaskCardSkeleton key={i} />)}
      </div>
    </div>
  )

  return (
    <div className="container mx-auto py-8 px-4 space-y-6 page-enter">
      <Breadcrumb items={[
        { label: '公司驾驶舱', href: '/company' },
        { label: currentProject?.name || '项目', href: `/projects/${projectId}/dashboard` },
        { label: '任务管理', href: `/projects/${projectId}/gantt` },
        { label: '任务总结' },
      ]} />

      <PageHeader
        title="任务管理 / 任务总结"
        subtitle="只承接已完成任务复盘，任务录入、WBS 拆分和执行维护仍回任务列表页。"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => projectId && navigate(`/projects/${projectId}/gantt`)}
          disabled={!projectId}
        >
          返回任务列表
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => projectId && navigate(`/projects/${projectId}/dashboard`)}
          disabled={!projectId}
        >
          项目 Dashboard
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void loadData()}>
          <RefreshCw className="w-4 h-4 mr-1.5" />
          刷新
        </Button>
      </PageHeader>

      <Card className="border-blue-100 bg-blue-50/60 shadow-sm">
        <CardContent className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="bg-blue-100 text-blue-700">任务管理子页</Badge>
              <Badge variant="secondary" className="bg-blue-100 text-blue-700">只读总结</Badge>
            </div>
            <p className="text-sm font-medium text-blue-950">当前页职责</p>
            <p className="text-sm leading-6 text-blue-900/80">
              这里只承接已完成任务的复盘、分组和趋势分析。任务录入、结构拆分、执行维护和进度调整仍在任务列表页完成。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => projectId && navigate(`/projects/${projectId}/gantt`)}>
              去任务列表
            </Button>
            <Button variant="ghost" size="sm" onClick={() => projectId && navigate(`/projects/${projectId}/dashboard`)}>
              对照项目 Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── 总结统计 ─────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="overflow-hidden">
            <CardContent className="pt-5 pb-4 bg-gradient-to-br from-blue-50 to-blue-100">
              <div className="flex items-center justify-between mb-2">
                <CheckSquare className="w-5 h-5 text-blue-500" />
              </div>
              <p className="text-3xl font-bold text-blue-700">{stats.total_completed}</p>
              <p className="text-xs text-gray-500 mt-1">已完成任务</p>
            </CardContent>
          </Card>

          {/* 卡2：按时完成 + SVG 环形进度圈 */}
          <Card className="overflow-hidden">
            <CardContent className="pt-4 pb-4 bg-gradient-to-br from-emerald-50 to-emerald-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold text-emerald-700">{stats.on_time_count}</p>
                  <p className="text-xs text-gray-500 mt-1">按时完成</p>
                </div>
                <div className="relative flex items-center justify-center">
                  <RingProgress rate={onTimeRate} size={68} stroke={7} color="#10b981" />
                  <span className="absolute text-xs font-bold text-emerald-700">{onTimeRate}%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 卡3：延期完成 */}
          <Card className="overflow-hidden">
            <CardContent className="pt-5 pb-4 bg-gradient-to-br from-amber-50 to-amber-100">
              <div className="flex items-center justify-between mb-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                {stats.total_completed > 0 && (
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full text-amber-600 bg-amber-100">{delayRate}%</span>
                )}
              </div>
              <p className="text-3xl font-bold text-amber-700">{stats.delayed_count}</p>
              <p className="text-xs text-gray-500 mt-1">延期完成</p>
            </CardContent>
          </Card>

          {/* 卡4：已完成里程碑 */}
          <Card className="overflow-hidden">
            <CardContent className="pt-5 pb-4 bg-gradient-to-br from-violet-50 to-violet-100">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="w-5 h-5 text-violet-500" />
              </div>
              <p className="text-3xl font-bold text-violet-700">{stats.completed_milestone_count}</p>
              <p className="text-xs text-gray-500 mt-1">已完成里程碑</p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="pt-5 pb-4 bg-gradient-to-br from-rose-50 to-rose-100">
              <div className="flex items-center justify-between mb-2">
                <Clock className="w-5 h-5 text-rose-500" />
              </div>
              <p className="text-3xl font-bold text-rose-700">
                {stats.avg_delay_days != null
                  ? stats.avg_delay_days.toFixed(1)
                  : (stats.delayed_count > 0
                    ? (allTasks.reduce((sum, t) => sum + t.delay_total_days, 0) / Math.max(stats.delayed_count, 1)).toFixed(1)
                    : '0.0'
                  )}
              </p>
              <p className="text-xs text-gray-500 mt-1">平均延期天数</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── 筛选与分组 ─────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="flex flex-wrap gap-3 items-center">
            <select className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
              value={filterType} onChange={e => setFilterType(e.target.value as any)}>
              <option value="all">全部任务类型</option>
              <option value="milestone">里程碑任务</option>
              <option value="normal">普通任务</option>
            </select>
            <select className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
              value={filterMilestone} onChange={e => setFilterMilestone(e.target.value)}>
              <option value="all">全部里程碑</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            {/* 责任人筛选 */}
            <select className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
              value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}>
              <option value="all">全部责任人</option>
              {allAssignees.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <input type="date" className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
              value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <span className="text-gray-400 text-sm">至</span>
            <input type="date" className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
              value={dateTo} onChange={e => setDateTo(e.target.value)} />
            <Button variant="ghost" size="sm" onClick={handleReset} className="ml-auto">重置筛选</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">分组方式</span>
            <div className="flex items-center gap-1 rounded-lg border overflow-hidden">
              {[
                { mode: 'milestone' as GroupMode, icon: <Layers className="w-3.5 h-3.5" />, label: '按里程碑' },
                { mode: 'building' as GroupMode, icon: <Building2 className="w-3.5 h-3.5" />, label: '按楼栋' },
                { mode: 'section' as GroupMode, icon: <BarChart3 className="w-3.5 h-3.5" />, label: '按分部' },
              ].map(({ mode, icon, label }) => (
                <button key={mode}
                  className={`flex items-center gap-1 px-3 py-2 text-xs transition-colors ${groupMode === mode ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                  onClick={() => setGroupMode(mode)}>
                  {icon}{label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 内容区 ────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 w-full max-w-xl">
          <TabsTrigger value="tasks" className="flex items-center gap-1.5">
            <CheckSquare className="w-3.5 h-3.5" />总结列表
          </TabsTrigger>
          <TabsTrigger value="trend" className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />完成趋势
          </TabsTrigger>
          <TabsTrigger value="assignees" className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />责任人
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-blue-500" />
                总结列表
                <Badge variant="secondary" className="ml-1">{displayGroups.length} 个分组</Badge>
              </CardTitle>
              <p className="text-sm text-gray-500">
                按当前筛选条件展示已完成任务的分组结果，任务详情仍可回跳到任务列表。
              </p>
            </CardHeader>
            <CardContent>
              {displayGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <CheckSquare className="w-14 h-14 text-gray-300 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-500 mb-2">暂无已完成任务</h3>
                  <p className="text-sm text-gray-400 mb-4">该项目尚无符合当前筛选条件的总结记录</p>
                  <Button variant="outline" size="sm" onClick={() => projectId && navigate(`/projects/${projectId}/gantt`)}>
                    去任务列表
                  </Button>
                </div>
              ) : (
                <div className="space-y-8">
                  {displayGroups.map(group => (
                    <MilestoneSection
                      key={group.id}
                      group={group}
                      projectId={projectId}
                      highlightTaskId={highlightTaskId}
                      onOpenDetail={t => { setDetailTask(t); setDetailOpen(true) }}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trend" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />月度完成趋势
              </CardTitle>
              <p className="text-sm text-gray-500">用于观察已完成任务的完成节奏变化，不承接写回。</p>
            </CardHeader>
            <CardContent><TrendChart projectId={projectId} /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignees" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-500" />责任人完成分析
              </CardTitle>
              <p className="text-sm text-gray-500">只展示责任人维度的完成分布，不替代任务列表。</p>
            </CardHeader>
            <CardContent><AssigneeChart projectId={projectId} /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <TaskDetailDialog
        task={detailTask}
        taskEvents={timelineEvents}
        projectId={projectId}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  )
}

