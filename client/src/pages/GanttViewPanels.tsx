import { Card, CardContent } from '@/components/ui/card'
import { CardHead } from '@/components/ui/card-head'
import { DurationBasisBadge } from '@/components/planning/DurationBasisBadge'
import { QuickBlockageForm } from '@/components/planning/blockages/QuickBlockageForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { inclusiveDurationDays } from '@/lib/durationDays'
import { formatDate, formatDateTime } from '@/lib/utils'
import { getWbsNodeTypeLabel } from '@/lib/wbsLabels'
import { ArrowRight, Flag, GitBranch, X } from 'lucide-react'
import { memo, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import type { CriticalPathSnapshot } from '@/lib/criticalPath'
import type { TaskConditionSummary } from '@/lib/taskBusinessStatus'
import { getTaskProgressReadOnlyReason, getTaskWbsNodeType, type Task, MILESTONE_LEVEL_CONFIG } from './GanttViewTypes'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export interface TaskDetailPanelProps {
  projectId: string
  selectedTask: Task
  onClose: () => void
  getBusinessStatus: (task: Task) => {
    label: string
    cls: string
    badge?: { text: string; cls: string }
  }
  onEdit: (task: Task) => void
  onOpenCondition: (task: Task) => void
  onOpenObstacle: (task: Task) => void
  criticalPathSummaryText?: string | null
  criticalPathError?: string | null
  criticalPathSnapshot?: CriticalPathSnapshot | null
  selectedCriticalPathTask?: {
    isAutoCritical?: boolean
    isManualAttention?: boolean
    isManualInserted?: boolean
    floatDays?: number
    durationDays?: number
  } | null
  onOpenCriticalPathDialog: () => void
  selectedTaskConditionSummary?: TaskConditionSummary | null
  selectedTaskObstacleCount?: number
  onSaveProgress: (taskId: string, value: number) => void | Promise<void>
  onQuickAddObstacle?: (task: Task, data: { description: string; severity: string; expectedResolution?: string }) => void | Promise<void>
  onOpenChangeLogs: () => void
}

function getScheduledDurationDays(task: Task) {
  return inclusiveDurationDays(task.start_date, task.end_date)
}

function formatDateRange(start?: string | null, end?: string | null) {
  return `${start ? formatDate(start) : '—'} ~ ${end ? formatDate(end) : '—'}`
}

export function TaskDetailPanel({
  projectId,
  selectedTask,
  onClose,
  getBusinessStatus,
  onEdit,
  onOpenCondition,
  onOpenObstacle,
  criticalPathSummaryText,
  criticalPathError,
  criticalPathSnapshot,
  selectedCriticalPathTask,
  onOpenCriticalPathDialog,
  selectedTaskConditionSummary = null,
  selectedTaskObstacleCount = 0,
  onSaveProgress,
  onQuickAddObstacle,
  onOpenChangeLogs,
}: TaskDetailPanelProps) {
  const biz = getBusinessStatus(selectedTask)
  const scheduledDuration = getScheduledDurationDays(selectedTask)
  const [progressDraft, setProgressDraft] = useState<number>(Number(selectedTask.progress ?? 0))
  const [progressSaving, setProgressSaving] = useState(false)
  const [progressFeedbackTaskId, setProgressFeedbackTaskId] = useState<string | null>(null)
  const [quickObstacleOpen, setQuickObstacleOpen] = useState(false)
  const [quickObstacleSubmitting, setQuickObstacleSubmitting] = useState(false)
  const selectedTaskProgress = Number(selectedTask.progress ?? 0)
  const progressReadOnlyReason = getTaskProgressReadOnlyReason(selectedTask.progress_method)
  const selectedTaskWbsNodeType = getTaskWbsNodeType(selectedTask)
  const pendingConditionCount = Math.max(
    0,
    Number(selectedTaskConditionSummary?.total ?? 0) - Number(selectedTaskConditionSummary?.satisfied ?? 0),
  )
  const selectedTaskObstacleCountValue = Number(selectedTaskObstacleCount ?? 0)

  useEffect(() => {
    setProgressDraft(Number(selectedTask.progress ?? 0))
    setProgressFeedbackTaskId(null)
    setQuickObstacleOpen(false)
  }, [selectedTask.id, selectedTask.progress])

  return (
    <div className="w-full xl:w-80 xl:flex-shrink-0 xl:sticky xl:top-4" data-testid="gantt-task-detail-panel">
      <Card variant="detail" className="max-h-[calc(100vh-2rem)] overflow-y-auto">
        <CardContent padding="md" className="space-y-2">
          <CardHead
            eyebrow="TASK DETAIL"
            title={selectedTask.title || '未命名任务'}
            action={
              <Button
                variant="ghost"
                type="button"
                aria-label="关闭任务详情"
                data-testid="gantt-task-detail-panel-close"
                onClick={onClose}
                className="ml-2 flex-shrink-0 rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            }
          />
          <div className="flex items-center gap-1.5">
            {selectedTask.is_milestone && (
              <Flag
                  className={`h-3.5 w-3.5 flex-shrink-0 ${MILESTONE_LEVEL_CONFIG[selectedTask.milestone_level ?? 1]?.color}`}
                fill="currentColor"
              />
            )}
            {selectedTask.wbs_code && <span className="font-mono text-xs text-slate-500">{selectedTask.wbs_code}</span>}
          </div>
        </CardContent>
        <Separator />

        <CardContent className="space-y-3 pt-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">业务状态</span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${biz.cls}`}>
              {biz.label}
              {biz.badge && <span className="opacity-80">· {biz.badge.text}</span>}
            </span>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-slate-500">进度</span>
              <span className="text-xs font-medium text-slate-700">{selectedTask.progress || 0}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${
                  selectedTask.status === 'completed'
                    ? 'bg-emerald-500'
                    : selectedTask.lagLevel === 'severe'
                      ? 'bg-orange-500'
                      : selectedTask.lagLevel === 'moderate'
                        ? 'bg-amber-400'
                        : selectedTask.lagLevel === 'mild'
                          ? 'bg-yellow-400'
                          : selectedTask.status === 'in_progress'
                              ? 'bg-blue-600'
                              : 'bg-slate-300'
                }`}
                style={{ width: `${selectedTask.progress || 0}%` }}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-3" data-testid="gantt-progress-entry-panel">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-blue-700">录进展</p>
                <p className="text-xs leading-4 text-blue-600">
                  进度、条件和障碍都在详情抽屉里处理。
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${progressDraft === selectedTaskProgress ? 'bg-white text-blue-700' : 'bg-blue-100 text-blue-700'}`}>
                {progressDraft}%
              </span>
            </div>

            <div className="space-y-2">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={progressDraft}
                disabled={Boolean(progressReadOnlyReason)}
                onChange={(event) => {
                  if (!progressReadOnlyReason) setProgressDraft(Math.max(0, Math.min(100, Number(event.target.value) || 0)))
                }}
                className="h-1.5 w-full accent-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="progress slider"
              />
              {progressReadOnlyReason ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="inline-flex cursor-help text-xs text-blue-700 underline decoration-dotted underline-offset-4">
                      {progressReadOnlyReason}
                    </p>
                  </TooltipTrigger>
                  <TooltipContent>{progressReadOnlyReason}</TooltipContent>
                </Tooltip>
              ) : null}
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={progressDraft}
                  disabled={Boolean(progressReadOnlyReason)}
                  onChange={(event) => {
                    if (!progressReadOnlyReason) setProgressDraft(Math.max(0, Math.min(100, Number(event.target.value) || 0)))
                  }}
                  className="h-9 bg-white disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                  aria-label="progress value"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-9 shrink-0"
                  disabled={Boolean(progressReadOnlyReason) || progressDraft === selectedTaskProgress || progressSaving}
                  loading={progressSaving}
                  data-testid="gantt-progress-save"
                  onClick={async () => {
                    if (progressReadOnlyReason) return
                    try {
                      setProgressSaving(true)
                      await onSaveProgress(selectedTask.id, progressDraft)
                      setProgressFeedbackTaskId(selectedTask.id)
                    } finally {
                      setProgressSaving(false)
                    }
                  }}
                >
                  暂存进度
                </Button>
              </div>
            </div>
            {progressFeedbackTaskId === selectedTask.id ? (
              <div className="surface-card p-3" data-testid="gantt-progress-health-feedback">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-700">进度已暂存</p>
                  <p className="text-xs leading-4 text-slate-500">
                    保存编辑后，Dashboard 会按后端健康与偏差口径回读；本页不前端计算健康分。
                  </p>
                </div>
                {projectId ? (
                  <Button asChild type="button" variant="outline" size="sm" className="mt-3 h-8 w-full justify-between text-xs">
                    <Link to={`/projects/${projectId}/dashboard`}>
                      <span>查看 Dashboard</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 justify-between border-blue-200 bg-white px-3 text-xs text-blue-700"
                onClick={() => onOpenCondition(selectedTask)}
              >
                <span>条件</span>
                <span>{pendingConditionCount > 0 ? `${pendingConditionCount}项待处理` : '已满足'}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 justify-between border-amber-200 bg-white px-3 text-xs text-amber-700"
                onClick={() => onOpenObstacle(selectedTask)}
              >
                <span>障碍</span>
                <span>{selectedTaskObstacleCountValue > 0 ? `${selectedTaskObstacleCountValue}条` : '暂无'}</span>
              </Button>
            </div>
            {onQuickAddObstacle ? (
              <div className="space-y-2" data-testid="gantt-progress-quick-obstacle">
                {quickObstacleOpen ? (
                  <div aria-busy={quickObstacleSubmitting}>
                    <QuickBlockageForm
                      className="border-blue-100 shadow-none"
                      onCancel={() => setQuickObstacleOpen(false)}
                      onSubmit={(data) => {
                        if (quickObstacleSubmitting) return
                        setQuickObstacleSubmitting(true)
                        void Promise.resolve(onQuickAddObstacle(selectedTask, data))
                          .then(() => setQuickObstacleOpen(false))
                          .catch(() => undefined)
                          .finally(() => setQuickObstacleSubmitting(false))
                      }}
                    />
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-full justify-between px-3 text-xs text-amber-700 hover:bg-amber-50"
                    data-testid="gantt-progress-quick-obstacle-toggle"
                    onClick={() => setQuickObstacleOpen(true)}
                  >
                    <span>快记一条阻碍</span>
                    <span>{selectedTaskObstacleCountValue > 0 ? `${selectedTaskObstacleCountValue}条处理中` : '描述 + 严重度'}</span>
                  </Button>
                )}
              </div>
            ) : null}
          </div>

          {scheduledDuration && (
            <div className="space-y-1.5 rounded-2xl bg-slate-50 p-3">
              <p className="mb-1 text-xs font-medium text-slate-600">当前排期</p>
              <div className="flex justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 text-slate-500">
                  <DurationBasisBadge basis="plan" compact variant="outline" />
                  排期工期
                </span>
                <span className="font-medium text-slate-700">{scheduledDuration} 天</span>
              </div>
            </div>
          )}

          {(selectedTask.start_date || selectedTask.end_date) && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">时间区间</span>
              <span className="num-mono text-slate-700">
                {formatDateRange(selectedTask.start_date, selectedTask.end_date)}
              </span>
            </div>
          )}

          {selectedTask.assignee_name && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">责任人</span>
              <span className="text-slate-700">{selectedTask.assignee_name}</span>
            </div>
          )}

          {selectedTask.participant_unit_name && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">责任单位</span>
              <Tooltip>
  <TooltipTrigger asChild>
    <span className="max-w-40 truncate text-slate-700" >
                {selectedTask.participant_unit_name}
              </span>
  </TooltipTrigger>
  <TooltipContent>{selectedTask.participant_unit_name}</TooltipContent>
</Tooltip>
            </div>
          )}

          {/* v1.4.3: Standard field groups — scope, WBS, responsibility */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-slate-400">工程范围</span>
            <div className="flex flex-wrap gap-1.5">
              {(selectedTask as any).building_name && <span className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.5 text-xs font-medium">楼栋: {(selectedTask as any).building_name}</span>}
              {(selectedTask as any).floor_name && <span className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.5 text-xs font-medium">楼层: {(selectedTask as any).floor_name}</span>}
              {(selectedTask as any).zone_name && <span className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.5 text-xs font-medium">区域: {(selectedTask as any).zone_name}</span>}
              {(selectedTask as any).phase_name && <span className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.5 text-xs font-medium">分期: {(selectedTask as any).phase_name}</span>}
              {(selectedTask as any).section_name && <span className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.5 text-xs font-medium">标段: {(selectedTask as any).section_name}</span>}
              {selectedTask.specialty_type && (<span className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.5 text-xs font-medium">专业: {selectedTask.specialty_type}</span>)}
            </div>
          </div>
          {(selectedTaskWbsNodeType || selectedTask.standard_work_code) && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-slate-400">WBS 分类</span>
              <div className="flex flex-wrap gap-1.5">
                {selectedTaskWbsNodeType && <span className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.5 text-xs font-medium">{getWbsNodeTypeLabel(selectedTaskWbsNodeType)}</span>}
                {selectedTask.standard_work_code && <span className="rounded bg-slate-100 text-slate-600 px-1.5 py-0.5 text-xs font-medium">{selectedTask.standard_work_code}</span>}
              </div>
            </div>
          )}

          {selectedTask.first_progress_at && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">首次填报</span>
              <span className="num-mono text-slate-600">
                {formatDateTime(selectedTask.first_progress_at)}
              </span>
            </div>
          )}

          {selectedTask.description && (
            <div className="text-xs leading-relaxed text-slate-600">
              <Separator className="mb-3" />
              <p className="mb-1 text-slate-500">描述</p>
              <p>{selectedTask.description}</p>
            </div>
          )}

          {(selectedTask.is_milestone || selectedTask.milestone_id) && projectId && (
            <Button asChild type="button" variant="outline" size="sm" className="h-8 w-full gap-1.5 border-slate-200 text-slate-700">
              <Link
                to={`/projects/${projectId}/milestones?highlight=${encodeURIComponent(selectedTask.milestone_id || selectedTask.id)}`}
              >
                查看里程碑详情
              </Link>
            </Button>
          )}

          <div
            className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3"
            data-testid="gantt-critical-path-panel"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-slate-700">关键路径</p>
                <p className="text-xs text-slate-500">
                  {criticalPathSummaryText || '暂无关键路径摘要'}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  selectedCriticalPathTask ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {selectedCriticalPathTask ? '已纳入快照' : '未纳入快照'}
              </span>
            </div>

            {selectedCriticalPathTask ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {selectedCriticalPathTask.isAutoCritical && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                      自动关键
                    </span>
                  )}
                  {selectedCriticalPathTask.isManualAttention && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      手动关注
                    </span>
                  )}
                  {selectedCriticalPathTask.isManualInserted && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      手动插链
                    </span>
                  )}
                </div>
                <div className="grid gap-1 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <span>浮动时间</span>
                    <span className="font-medium text-slate-700">{selectedCriticalPathTask.floatDays ?? 0} 天</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5">
                      <DurationBasisBadge basis="plan" compact variant="outline" />
                      链路工期
                    </span>
                    <span className="font-medium text-slate-700">{selectedCriticalPathTask.durationDays ?? 0} 天</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-1" />
            )}

            {criticalPathSnapshot?.primaryChain?.taskIds?.length ? (
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-700">主链顺序</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {criticalPathSnapshot.primaryChain.displayLabel}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {criticalPathSnapshot.primaryChain.taskIds.map((taskId, index) => {
                    const snapshotTask = criticalPathSnapshot.tasks.find((item) => item.taskId === taskId)
                    const active = taskId === selectedTask.id
                    return (
                      <Tooltip key={taskId}>
                        <TooltipTrigger asChild>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${
                              active
                                ? 'border-blue-300 bg-blue-50 text-blue-700'
                                : 'border-slate-200 bg-slate-50 text-slate-600'
                            }`}
                          >
                            <span className="font-semibold">{index + 1}</span>
                            <span className="max-w-44 truncate">{snapshotTask?.title || taskId}</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{snapshotTask?.title || taskId}</TooltipContent>
                      </Tooltip>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {criticalPathError && <p className="text-xs text-amber-700">{criticalPathError}</p>}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full gap-1.5 border-slate-200 text-slate-700"
              onClick={onOpenCriticalPathDialog}
              data-testid="gantt-open-critical-path-dialog-from-sidebar"
            >
              <GitBranch className="h-4 w-4" />
              查看完整关键路径
            </Button>
          </div>

          <Separator />
          <div className="grid grid-cols-4 gap-2 pt-3">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => onEdit(selectedTask)}
            >
              编辑
            </Button>
            <Button variant="ghost"
              type="button"
              onClick={() => onOpenCondition(selectedTask)}
              className="h-8 rounded-md border border-emerald-200 px-2 text-xs text-emerald-700 transition-colors hover:bg-emerald-50"
            >
              条件
            </Button>
            <Button variant="ghost"
              type="button"
              onClick={() => onOpenObstacle(selectedTask)}
              className="h-8 rounded-md border border-amber-200 px-2 text-xs text-amber-700 transition-colors hover:bg-amber-50"
            >
              障碍
            </Button>
            <Button variant="ghost"
              type="button"
              onClick={onOpenChangeLogs}
              data-testid="gantt-open-progress-deviation"
              className="h-8 rounded-md border border-slate-200 px-2 text-xs text-slate-700 transition-colors hover:bg-slate-50"
            >
              偏差分析
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
