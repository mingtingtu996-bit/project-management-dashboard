/**
 * TaskStatusCard.tsx
 *
 * 任务执行概况卡片 — 融合版
 *
 * 上半部分：任务状态分布（进行中/已完成/未开始/延期 数量+比例）+ 环形图
 * 下半部分：完成质量摘要（按时完成数、延期完成数、最近一条完成记录）
 * 底部：双入口（查看全部任务 / 查看完成总结）
 *
 * @module
 */

import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { apiGet } from '@/lib/apiClient'
import { CheckCircle2, Clock, ListTodo, AlertTriangle, ChevronRight, TrendingUp, User } from 'lucide-react'
import { useCountUp } from '@/hooks/useCountUp'
import { CHART_AXIS_COLORS, TASK_STAGE_COLORS } from '@/lib/chartPalette'

interface TaskStatusCardProps {
  completed: number
  inProgress: number
  notStarted: number
  delayed: number
  projectId?: string
}

// 完成质量数据（来自 task-summary API）
interface QualityStats {
  total_completed: number
  on_time_count: number
  delayed_count: number
  last_completed_title?: string
  last_completed_at?: string
  last_completed_status?: 'on_time' | 'delayed'
}

export function TaskStatusCard({
  completed,
  inProgress,
  notStarted,
  delayed,
  projectId,
}: TaskStatusCardProps) {
  const [quality, setQuality] = useState<QualityStats | null>(null)

  // 异步加载完成质量数据
  useEffect(() => {
    if (!projectId) return
    apiGet<{ stats?: QualityStats; groups?: Array<{ tasks?: Array<{ title?: string; completed_at?: string; status_label?: 'on_time' | 'delayed' }> }> } | null>(
      `/api/task-summaries/projects/${projectId}/task-summary?limit=1`,
    )
      .then(data => {
        if (!data) return
        const stats = data.stats as QualityStats | undefined
        // 最近一条完成记录：取第一个里程碑分组里第一个任务
        const firstTask = data.groups?.[0]?.tasks?.[0] as {
          title?: string
          completed_at?: string
          status_label?: 'on_time' | 'delayed'
        } | undefined
        if (stats) {
          setQuality({
            ...stats,
            last_completed_title: firstTask?.title,
            last_completed_at: firstTask?.completed_at,
            last_completed_status: firstTask?.status_label,
          })
        }
      })
      .catch((e) => {
        if (import.meta.env.DEV) console.error('[TaskStatusCard] 加载完成质量数据失败:', e)
      })
  }, [projectId])

  // 延期是预警标签，不是独立主状态；总量只按主状态三分法统计，避免重复计数
  const total = useMemo(() => completed + inProgress + notStarted, [completed, inProgress, notStarted])
  const completedRate = useMemo(() => total > 0 ? Math.round((completed / total) * 100) : 0, [total, completed])

  const onTimeRate = useMemo(() =>
    quality && quality.total_completed > 0
      ? Math.round((quality.on_time_count / quality.total_completed) * 100)
      : null,
  [quality])

  // 环形图参数 - 使用useMemo缓存
  const { radius, circumference, completedOffset, inProgressOffset, notStartedOffset } = useMemo(() => {
    const r = 36
    const c = 2 * Math.PI * r
    return {
      radius: r,
      circumference: c,
      completedOffset: c - (total > 0 ? (completed / total) * c : 0),
      inProgressOffset: c - (total > 0 ? ((completed + inProgress) / total) * c : 0),
      notStartedOffset: c - (total > 0 ? ((completed + inProgress + notStarted) / total) * c : 0),
    }
  }, [total, completed, inProgress, notStarted])

  // 动画数字
  const animCompleted = useCountUp(completed, { duration: 900, delay: 50 })
  const animInProgress = useCountUp(inProgress, { duration: 900, delay: 100 })
  const animNotStarted = useCountUp(notStarted, { duration: 900, delay: 150 })
  const animDelayed = useCountUp(delayed, { duration: 900, delay: 200 })
  const animOnTime = useCountUp(quality?.on_time_count ?? 0, { duration: 900, delay: 300 })
  const animDelayedCompleted = useCountUp(quality?.delayed_count ?? 0, { duration: 900, delay: 350 })

  const stats = [
    {
      label: '已完成',
      value: animCompleted,
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
      bgColor: 'bg-emerald-500',
      textColor: 'text-emerald-600',
      hoverBg: 'hover:bg-emerald-50',
    },
    {
      label: '进行中',
      value: animInProgress,
      icon: <Clock className="h-3.5 w-3.5 text-blue-500" />,
      bgColor: 'bg-blue-500',
      textColor: 'text-blue-600',
      hoverBg: 'hover:bg-blue-50',
    },
    {
      label: '未开始',
      value: animNotStarted,
      icon: <ListTodo className="h-3.5 w-3.5 text-amber-500" />,
      bgColor: 'bg-amber-500',
      textColor: 'text-amber-600',
      hoverBg: 'hover:bg-amber-50',
    },
    {
      label: '已延期',
      value: animDelayed,
      icon: <AlertTriangle className="h-3.5 w-3.5 text-red-500" />,
      bgColor: 'bg-red-500',
      textColor: 'text-red-600',
      hoverBg: 'hover:bg-red-50',
    },
  ]

  const tasksHref = projectId ? `/projects/${projectId}/gantt` : '/company'
  const summaryHref = projectId ? `/projects/${projectId}/task-summary` : '/task-summary'

  return (
    <Card variant="metric">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-gray-800">任务执行概况</CardTitle>
          <span className="text-sm text-gray-400">共 {total} 个任务</span>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* ── 上半：状态分布 ── */}
        <div className="flex items-center gap-5">
          {/* 左侧统计列表 */}
          <div className="space-y-1.5 flex-1">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className={`flex items-center justify-between px-2 py-1.5 rounded-lg ${stat.hoverBg} transition-colors cursor-default group`}
              >
                <div className="flex items-center gap-2">
                  {stat.icon}
                  <span className={`text-gray-700 text-sm font-medium`}>{stat.label}</span>
                </div>
                <span className={`${stat.textColor} font-bold tabular-nums`}>{stat.value}</span>
              </div>
            ))}
          </div>

          {/* 右侧环形图 */}
          <div className="w-28 h-28 relative flex-shrink-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r={radius} fill="none" stroke={CHART_AXIS_COLORS.neutralStroke} strokeWidth="10" />
              {completed > 0 && (
                <circle
                  cx="50" cy="50" r={radius} fill="none" stroke={TASK_STAGE_COLORS.completed} strokeWidth="10"
                  strokeDasharray={circumference} strokeDashoffset={completedOffset}
                  strokeLinecap="round" className="transition-all duration-1000 ease-out"
                />
              )}
              {inProgress > 0 && (
                <circle
                  cx="50" cy="50" r={radius} fill="none" stroke={TASK_STAGE_COLORS.inProgress} strokeWidth="10"
                  strokeDasharray={circumference} strokeDashoffset={inProgressOffset}
                  strokeLinecap="round" className="transition-all duration-1000 ease-out"
                  style={{ transform: `rotate(${(completed / total) * 360}deg)`, transformOrigin: 'center' }}
                />
              )}
              {notStarted > 0 && (
                <circle
                  cx="50" cy="50" r={radius} fill="none" stroke={TASK_STAGE_COLORS.notStarted} strokeWidth="10"
                  strokeDasharray={circumference} strokeDashoffset={notStartedOffset}
                  strokeLinecap="round" className="transition-all duration-1000 ease-out"
                  style={{ transform: `rotate(${((completed + inProgress) / total) * 360}deg)`, transformOrigin: 'center' }}
                />
              )}
              {delayed > 0 && (
                <circle
                  cx="50" cy="50" r={radius} fill="none" stroke={TASK_STAGE_COLORS.delayed} strokeWidth="10"
                  strokeDasharray={circumference} strokeDashoffset={0}
                  strokeLinecap="round" className="transition-all duration-1000 ease-out"
                  style={{ transform: `rotate(${((completed + inProgress + notStarted) / total) * 360}deg)`, transformOrigin: 'center' }}
                />
              )}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="text-lg font-bold text-gray-800 tabular-nums">{completedRate}%</div>
                <div className="text-xs text-gray-400">已完成</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 分割线 ── */}
        <div className="border-t border-gray-100" />

        {/* ── 下半：完成质量摘要 ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            完成质量
          </div>

          {quality ? (
            <>
              {/* 按时 / 延期 计数 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-600 tabular-nums">{animOnTime}</div>
                  <div className="text-xs text-emerald-500 mt-0.5">按时完成</div>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-amber-600 tabular-nums">{animDelayedCompleted}</div>
                  <div className="text-xs text-amber-500 mt-0.5">延期完成</div>
                </div>
              </div>

              {/* 按时率 */}
              {onTimeRate !== null && quality.total_completed > 0 && (
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>按时完成率</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
                        style={{ width: `${onTimeRate}%` }}
                      />
                    </div>
                    <span className="font-semibold text-emerald-600 tabular-nums">{onTimeRate}%</span>
                  </div>
                </div>
              )}

              {/* 最近一条完成记录 */}
              {quality.last_completed_title && (
                <div className="flex items-start gap-2 bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600">
                  <User className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-700">{quality.last_completed_title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {quality.last_completed_at && (
                        <span className="text-gray-400">
                          {new Date(quality.last_completed_at).toLocaleDateString('zh-CN')}
                        </span>
                      )}
                      {quality.last_completed_status && (
                        <StatusBadge
                          status={quality.last_completed_status}
                          fallbackLabel={quality.last_completed_status === 'on_time' ? '按时完成' : '延期完成'}
                          className="px-1.5 py-0.5 text-[10px] font-medium"
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            // 暂无完成数据
            <div className="text-center py-3 text-xs text-gray-400">
              暂无已完成任务
            </div>
          )}
        </div>

        {/* ── 双入口 ── */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Link
            to={tasksHref}
            className="w-full flex items-center justify-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg py-2 transition-colors border border-blue-100"
          >
            查看全部任务
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            to={summaryHref}
            className="w-full flex items-center justify-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg py-2 transition-colors border border-emerald-100"
          >
            查看完成总结
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

export default TaskStatusCard
