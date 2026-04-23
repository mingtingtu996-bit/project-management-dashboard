import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingState } from '@/components/ui/loading-state'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDate } from '@/lib/utils'
import { Flag, GitBranch, X } from 'lucide-react'

import { type Task, MILESTONE_LEVEL_CONFIG, SPECIALTY_TYPES } from './GanttViewTypes'

interface DelayRequestRecord {
  id: string
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn' | string
  delay_days: number
  original_date?: string | null
  delayed_date?: string | null
  reason?: string | null
  delay_reason?: string | null
  requested_at?: string | null
}

interface BaselineVersionOption {
  id: string
  version: number
  title: string
}

interface DelayRequestFormState {
  delayedDate: string
  reason: string
  baselineVersionId: string
}

interface DelayRequestFormErrors {
  baselineVersionId?: string
  delayedDate?: string
  reason?: string
  form?: string
}

export interface TaskDetailPanelProps {
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
  selectedCriticalPathTask?: {
    isAutoCritical?: boolean
    isManualAttention?: boolean
    isManualInserted?: boolean
    floatDays?: number
    durationDays?: number
  } | null
  onOpenCriticalPathDialog: () => void
  delayRequests: DelayRequestRecord[]
  delayRequestsLoading: boolean
  pendingDelayRequest?: DelayRequestRecord | null
  rejectedDelayRequest?: DelayRequestRecord | null
  duplicateRejectedReason: boolean
  baselineOptions: BaselineVersionOption[]
  baselineLoading: boolean
  delayRequestForm: DelayRequestFormState
  delayFormErrors: DelayRequestFormErrors
  delayRequestSubmitting: boolean
  delayRequestWithdrawingId?: string | null
  delayRequestReviewingId?: string | null
  delayImpactDays?: number
  delayImpactSummary?: string
  onDelayRequestFormChange: (field: keyof DelayRequestFormState, value: string) => void
  onSubmitDelayRequest: () => void
  onWithdrawDelayRequest: () => void
  onApproveDelayRequest: () => void
  onRejectDelayRequest: () => void
  canReviewDelayRequest?: boolean
  onOpenChangeLogs: () => void
}

function getDelayStatusLabel(status: string) {
  switch (status) {
    case 'pending':
      return '待审批'
    case 'approved':
      return '已批准'
    case 'rejected':
      return '已驳回'
    case 'withdrawn':
      return '已撤回'
    default:
      return status
  }
}

function getScheduledDurationDays(task: Task) {
  if (!task.start_date || !task.end_date) return null
  const start = new Date(task.start_date)
  const end = new Date(task.end_date)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1)
}

function formatDateRange(start?: string | null, end?: string | null) {
  return `${start ? formatDate(start) : '—'} ~ ${end ? formatDate(end) : '—'}`
}

export function TaskDetailPanel({
  selectedTask,
  onClose,
  getBusinessStatus,
  onEdit,
  onOpenCondition,
  onOpenObstacle,
  criticalPathSummaryText,
  criticalPathError,
  selectedCriticalPathTask,
  onOpenCriticalPathDialog,
  delayRequests,
  delayRequestsLoading,
  pendingDelayRequest,
  rejectedDelayRequest,
  duplicateRejectedReason,
  baselineOptions,
  baselineLoading,
  delayRequestForm,
  delayFormErrors,
  delayRequestSubmitting,
  delayRequestWithdrawingId,
  delayRequestReviewingId,
  delayImpactDays,
  delayImpactSummary,
  onDelayRequestFormChange,
  onSubmitDelayRequest,
  onWithdrawDelayRequest,
  onApproveDelayRequest,
  onRejectDelayRequest,
  canReviewDelayRequest = false,
  onOpenChangeLogs,
}: TaskDetailPanelProps) {
  const biz = getBusinessStatus(selectedTask)
  const scheduledDuration = getScheduledDurationDays(selectedTask)
  const specialty = SPECIALTY_TYPES.find((item) => item.value === selectedTask.specialty_type)
  const latestDelayRequest = delayRequests[0]
  const pendingDelayRequestAgeDays = pendingDelayRequest?.requested_at
    ? Math.max(0, Math.floor((Date.now() - new Date(pendingDelayRequest.requested_at).getTime()) / 86400000))
    : 0
  const showApprovalReminder = Boolean(pendingDelayRequest && pendingDelayRequestAgeDays >= 3)
  const showCriticalDelayNotice = Boolean(selectedCriticalPathTask && typeof delayImpactDays === 'number' && delayImpactDays > 0)

  return (
    <div className="w-full xl:w-80 xl:flex-shrink-0 xl:sticky xl:top-4" data-testid="gantt-task-detail-panel">
      <Card variant="detail" className="max-h-[calc(100vh-2rem)] overflow-y-auto">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 border-b border-slate-100 pb-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-1.5">
              {selectedTask.is_milestone && (
                <Flag
                  className={`h-3.5 w-3.5 flex-shrink-0 ${MILESTONE_LEVEL_CONFIG[selectedTask.milestone_level ?? 1]?.color}`}
                  fill="currentColor"
                />
              )}
              <CardTitle className="truncate text-sm font-semibold">
                {selectedTask.title || selectedTask.name}
              </CardTitle>
            </div>
            {selectedTask.wbs_code && (
              <span className="font-mono text-[10px] text-slate-400">{selectedTask.wbs_code}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-2 flex-shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </CardHeader>

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
                    : selectedTask.status === 'blocked'
                      ? 'bg-amber-500'
                      : 'bg-blue-500'
                }`}
                style={{ width: `${selectedTask.progress || 0}%` }}
              />
            </div>
          </div>

          {(selectedTask.reference_duration || selectedTask.ai_duration || scheduledDuration) && (
            <div className="space-y-1.5 rounded-2xl bg-slate-50 p-3">
              <p className="mb-1 text-xs font-medium text-slate-600">工期对比</p>
              {selectedTask.reference_duration && (
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">计划工期</span>
                  <span className="font-medium text-slate-700">{selectedTask.reference_duration} 天</span>
                </div>
              )}
              {scheduledDuration && (
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">排期工期</span>
                  <span
                    className={`font-medium ${
                      selectedTask.reference_duration && scheduledDuration > selectedTask.reference_duration
                        ? 'text-red-600'
                        : 'text-slate-700'
                    }`}
                  >
                    {scheduledDuration} 天
                  </span>
                </div>
              )}
              {selectedTask.ai_duration && (
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">AI 推荐</span>
                  <span className="font-medium text-purple-600">{selectedTask.ai_duration} 天</span>
                </div>
              )}
            </div>
          )}

          {(selectedTask.start_date || selectedTask.end_date) && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">时间区间</span>
              <span className="tabular-nums text-slate-700">
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

          {selectedTask.responsible_unit && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">责任单位</span>
              <span className="max-w-[160px] truncate text-slate-700" title={selectedTask.responsible_unit}>
                {selectedTask.responsible_unit}
              </span>
            </div>
          )}

          {selectedTask.specialty_type && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">专业类型</span>
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${specialty?.color || 'bg-slate-100 text-slate-600'}`}>
                {specialty?.label || selectedTask.specialty_type}
              </span>
            </div>
          )}

          {selectedTask.first_progress_at && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">首次填报</span>
              <span className="tabular-nums text-slate-600">
                {new Date(selectedTask.first_progress_at).toLocaleString('zh-CN', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          )}

          {selectedTask.description && (
            <div className="border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-600">
              <p className="mb-1 text-slate-400">描述</p>
              <p>{selectedTask.description}</p>
            </div>
          )}

          <div
            className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3"
            data-testid="gantt-critical-path-panel"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-slate-700">关键路径</p>
                <p className="text-[11px] text-slate-500">
                  {criticalPathSummaryText || '暂无关键路径摘要'}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
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
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                      自动关键
                    </span>
                  )}
                  {selectedCriticalPathTask.isManualAttention && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                      手动关注
                    </span>
                  )}
                  {selectedCriticalPathTask.isManualInserted && (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700">
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
                    <span>链路工期</span>
                    <span className="font-medium text-slate-700">{selectedCriticalPathTask.durationDays ?? 0} 天</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500">
                当前任务还不在关键路径快照中，可打开图谱后设置手动关注或插链。
              </p>
            )}

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

          <div
            className="space-y-2 rounded-2xl border border-orange-100 bg-orange-50/60 p-3"
            data-testid="gantt-delay-request-panel"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-orange-700">延期申请</p>
                <p className="text-[11px] text-orange-700/80">
                  统一走延期申请流程，支持待审批锁定、撤回和驳回后重新提交提醒。
                </p>
              </div>
              {pendingDelayRequest ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                  待审批
                </span>
              ) : rejectedDelayRequest ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                  最近一次已驳回
                </span>
              ) : latestDelayRequest ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                  最近状态 {getDelayStatusLabel(latestDelayRequest.status)}
                </span>
              ) : null}
            </div>

            {delayRequestsLoading ? (
              <LoadingState
                label="延期申请加载中"
                className="min-h-24 border-0 bg-transparent px-0 py-2 shadow-none"
              />
            ) : (
              <>
                {rejectedDelayRequest && (
                  <div
                    className="rounded-md border border-red-200 bg-white px-2.5 py-2 text-xs text-red-700"
                    data-testid="gantt-delay-request-rejected-hint"
                  >
                    最近一次驳回原因：
                    {rejectedDelayRequest.reason ?? rejectedDelayRequest.delay_reason ?? '未说明'}
                  </div>
                )}

                <div className="grid gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-orange-800">绑定基线版本</Label>
                    <Select
                      value={delayRequestForm.baselineVersionId || '__none__'}
                      onValueChange={(value) =>
                        onDelayRequestFormChange(
                          'baselineVersionId',
                          value === '__none__' ? '' : value,
                        )
                      }
                      disabled={
                        Boolean(pendingDelayRequest) ||
                        delayRequestSubmitting ||
                        baselineLoading ||
                        baselineOptions.length === 0
                      }
                    >
                      <SelectTrigger
                        data-testid="gantt-delay-request-baseline"
                        className="bg-white"
                      >
                        <SelectValue
                          placeholder={baselineLoading ? '加载基线版本中…' : '请选择基线版本'}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">未绑定基线版本</SelectItem>
                        {baselineOptions.map((baseline) => (
                          <SelectItem key={baseline.id} value={baseline.id}>
                            V{baseline.version} · {baseline.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {delayFormErrors.baselineVersionId && (
                      <p className="text-xs text-red-600">{delayFormErrors.baselineVersionId}</p>
                    )}
                    {baselineOptions.length === 0 && !baselineLoading && (
                      <p className="text-xs text-orange-700">
                        当前项目还没有已确认的基线版本，延期申请暂不支持提交。
                      </p>
                    )}
                  </div>

                  <Input
                    type="date"
                    value={delayRequestForm.delayedDate}
                    onChange={(event) => onDelayRequestFormChange('delayedDate', event.target.value)}
                    disabled={
                      Boolean(pendingDelayRequest) ||
                      delayRequestSubmitting ||
                      !(selectedTask.end_date || selectedTask.planned_end_date)
                    }
                    data-testid="gantt-delay-request-date"
                  />
                  {delayFormErrors.delayedDate && (
                    <p className="text-xs text-red-600">{delayFormErrors.delayedDate}</p>
                  )}

                  <textarea
                    value={delayRequestForm.reason}
                    onChange={(event) => onDelayRequestFormChange('reason', event.target.value)}
                    placeholder="填写延期原因"
                    disabled={Boolean(pendingDelayRequest) || delayRequestSubmitting}
                    data-testid="gantt-delay-request-reason"
                    className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  {delayFormErrors.reason && (
                    <p className="text-xs text-red-600">{delayFormErrors.reason}</p>
                  )}
                </div>

                {delayFormErrors.form && (
                  <p className="text-xs text-red-600" data-testid="gantt-delay-request-inline-error">
                    {delayFormErrors.form}
                  </p>
                )}

                {pendingDelayRequest && (
                  <p
                    className="text-xs text-amber-700"
                    data-testid="gantt-delay-request-pending-hint"
                  >
                    已有待审批申请，提交按钮已禁用。
                  </p>
                )}

                {pendingDelayRequest ? (
                  <p
                    className="text-xs text-sky-700"
                    data-testid="gantt-delay-request-warning-downgrade"
                  >
                    审批中：同类延期预警按“提示”口径降级展示，审批完成后恢复正常风险级别。
                  </p>
                ) : null}

                {showApprovalReminder ? (
                  <p
                    className="text-xs text-red-600"
                    data-testid="gantt-delay-request-reminder"
                  >
                    当前申请已待审批 {pendingDelayRequestAgeDays} 天，建议尽快催办审批人。
                  </p>
                ) : null}

                {duplicateRejectedReason && (
                  <p
                    className="text-xs text-red-600"
                    data-testid="gantt-delay-request-duplicate-reason-hint"
                  >
                    重新提交原因不能与最近一次驳回原因重复。
                  </p>
                )}

                <div className="rounded-md border border-orange-200 bg-white px-2.5 py-2 text-xs text-orange-800" data-testid="gantt-delay-impact-summary">
                  <div className="font-medium">工期影响评估</div>
                  <div className="mt-1">{delayImpactSummary || '选择延期后的日期后，将自动估算对总工期的影响。'}</div>
                  {typeof delayImpactDays === 'number' && delayImpactDays > 0 ? (
                    <div className="mt-1 text-red-600">关键路径已无法完全吸收本次延期。</div>
                  ) : null}
                  {showCriticalDelayNotice ? (
                    <div className="mt-1 text-red-600" data-testid="gantt-critical-delay-notice">
                      当前任务位于关键路径，本次延期将直接推迟项目关键节点。
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={onSubmitDelayRequest}
                    loading={delayRequestSubmitting}
                    disabled={
                      Boolean(pendingDelayRequest) ||
                      duplicateRejectedReason ||
                      !(selectedTask.end_date || selectedTask.planned_end_date) ||
                      baselineOptions.length === 0
                    }
                    data-testid="gantt-delay-request-submit"
                  >
                    提交延期申请
                  </Button>
                  {pendingDelayRequest && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={onWithdrawDelayRequest}
                      loading={delayRequestWithdrawingId === pendingDelayRequest.id}
                      data-testid="gantt-delay-request-withdraw"
                    >
                      撤回待审批申请
                    </Button>
                  )}
                  {pendingDelayRequest && canReviewDelayRequest && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={onApproveDelayRequest}
                        loading={delayRequestReviewingId === `approve:${pendingDelayRequest.id}`}
                        data-testid="gantt-delay-request-approve"
                      >
                        批准延期
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={onRejectDelayRequest}
                        loading={delayRequestReviewingId === `reject:${pendingDelayRequest.id}`}
                        data-testid="gantt-delay-request-reject"
                      >
                        驳回延期
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2 border-t border-slate-100 pt-3">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => onEdit(selectedTask)}
            >
              编辑
            </Button>
            <button
              type="button"
              onClick={() => onOpenCondition(selectedTask)}
              className="h-8 rounded-md border border-emerald-200 px-2 text-xs text-emerald-700 transition-colors hover:bg-emerald-50"
            >
              条件
            </button>
            <button
              type="button"
              onClick={() => onOpenObstacle(selectedTask)}
              className="h-8 rounded-md border border-amber-200 px-2 text-xs text-amber-700 transition-colors hover:bg-amber-50"
            >
              障碍
            </button>
            <button
              type="button"
              onClick={onOpenChangeLogs}
              data-testid="gantt-open-change-log"
              className="h-8 rounded-md border border-slate-200 px-2 text-xs text-slate-700 transition-colors hover:bg-slate-50"
            >
              变更记录
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
