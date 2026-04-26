import { AlertTriangle, Layers3, ListChecks, Plus, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useDialogFocusRestore } from '@/hooks/useDialogFocusRestore'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { DRAWING_REVIEW_MODE_LABELS } from '../constants'
import type {
  DrawingLinkedAcceptanceView,
  DrawingLinkedTaskView,
  DrawingPackageDetailView,
  DrawingSignalView,
} from '../types'

function itemStatusLabel(status: 'missing' | 'available' | 'outdated') {
  if (status === 'missing') return '缺失'
  if (status === 'outdated') return '过期'
  return '已具备'
}

function readinessLabel(value: boolean | null | undefined) {
  return value ? '可以' : '不可以'
}

function escalationLabel(signal: DrawingSignalView) {
  const entityLabel = signal.escalatedEntityType === 'risk' ? '风险' : '问题'
  return signal.escalatedAt ? `已升级为${entityLabel} · ${signal.escalatedAt}` : `已升级为${entityLabel}`
}

export function DrawingDetailDrawer({
  open,
  detail,
  onOpenChange,
  onOpenVersions,
  onSetCurrentVersion,
  onAddDrawing,
  onCreateIssue,
  onCreateRisk,
  canEdit = true,
}: {
  open: boolean
  detail: DrawingPackageDetailView | null
  onOpenChange: (open: boolean) => void
  onOpenVersions: () => void
  onSetCurrentVersion: (versionId: string) => void
  onAddDrawing?: () => void
  onCreateIssue?: (signal: DrawingSignalView) => void
  onCreateRisk?: (signal: DrawingSignalView) => void
  canEdit?: boolean
}) {
  useDialogFocusRestore(open)
  const packageCard = detail?.package

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="left-auto right-0 top-0 h-full max-h-none w-full max-w-5xl translate-x-0 translate-y-0 rounded-none border-l border-slate-200 bg-white p-0 shadow-2xl data-[state=open]:slide-in-from-right-0"
        data-testid="drawing-detail-drawer"
      >
        <div className="flex h-full flex-col">
          <DialogHeader className="border-b border-slate-100 px-6 py-5 text-left">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="text-xl text-slate-900">
                  {packageCard?.packageName ?? '图纸包详情'}
                </DialogTitle>
              </div>
              {packageCard && (
                <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
                  {DRAWING_REVIEW_MODE_LABELS[packageCard.reviewMode]}
                </Badge>
              )}
              {onAddDrawing && canEdit ? (
                <Button size="sm" variant="outline" onClick={onAddDrawing} data-testid="drawing-detail-add-drawing">
                  <Plus className="mr-2 h-4 w-4" />
                  补录图纸
                </Button>
              ) : null}
            </div>
          </DialogHeader>

          {!detail ? (
            <div className="flex flex-1 items-center justify-center p-8" />
          ) : (
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
                <Card className="border-slate-200 shadow-sm">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="rounded-full px-2.5 py-1 text-xs">
                        {packageCard?.disciplineType}
                      </Badge>
                      <Badge variant="outline" className="rounded-full px-2.5 py-1 text-xs">
                        {packageCard?.documentPurpose}
                      </Badge>
                      {packageCard?.scheduleImpactFlag && (
                        <Badge variant="destructive" className="rounded-full px-2.5 py-1 text-xs">
                          工期影响
                        </Badge>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <InfoBox label="当前有效版本" value={packageCard?.currentVersionLabel ?? '未设置'} />
                      <InfoBox label="齐套度" value={`${packageCard?.completenessRatio ?? 0}%`} />
                      <InfoBox label="缺失项" value={`${packageCard?.missingRequiredCount ?? 0} 项`} />
                      <InfoBox label="当前审图" value={packageCard?.currentReviewStatus ?? '不适用'} />
                      {packageCard?.review_report_no && (
                        <InfoBox label="审图报告编号" value={packageCard.review_report_no} />
                      )}
                      {packageCard?.review_opinion && (
                        <div className="sm:col-span-2">
                          <InfoBox label="审图意见" value={packageCard.review_opinion} />
                        </div>
                      )}
                    </div>

                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card className="border-slate-200 shadow-sm">
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        <Layers3 className="h-4 w-4 text-blue-600" />
                        应有项
                      </div>
                      <div className="space-y-2">
                        {detail.requiredItems.map((item) => (
                          <div
                            key={item.itemId}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2"
                          >
                            <div>
                              <div className="text-sm font-medium text-slate-900">{item.itemName}</div>
                              <div className="text-xs text-slate-500">{item.itemCode}</div>
                            </div>
                            <Badge
                              variant={item.status === 'missing' ? 'destructive' : 'secondary'}
                              className="rounded-full px-2.5 py-1 text-xs"
                            >
                              {itemStatusLabel(item.status)}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 shadow-sm">
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                          <RefreshCw className="h-4 w-4 text-slate-500" />
                          版本记录
                        </div>
                        <Button size="sm" variant="outline" onClick={onOpenVersions}>
                          查看版本窗口
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {detail.records.map((record) => (
                          <div
                            key={record.versionId}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2"
                          >
                            <div>
                              <div className="text-sm font-medium text-slate-900">v{record.versionNo}</div>
                              <div className="text-xs text-slate-500">{record.drawingName}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              {record.isCurrentVersion && (
                                <Badge className="rounded-full px-2.5 py-1 text-xs">当前</Badge>
                              )}
                              {canEdit ? (
                                <Button size="sm" variant="outline" onClick={() => onSetCurrentVersion(record.versionId)}>
                                设为当前
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Card className="border-slate-200 shadow-sm">
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      施工 / 验收可用性
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <InfoBox label="可施工" value={readinessLabel(packageCard?.isReadyForConstruction)} />
                      <InfoBox label="可验收" value={readinessLabel(packageCard?.isReadyForAcceptance)} />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm" data-testid="drawing-submission-status">
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <Layers3 className="h-4 w-4 text-violet-600" />
                      送审状态
                    </div>
                    {detail.drawings.length === 0 ? (
                      <div className="text-sm text-slate-500">暂无图纸送审记录。</div>
                    ) : (
                      <div className="space-y-2">
                        {detail.drawings.map((row) => (
                          <div key={row.drawingId} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                            <div className="text-sm font-medium text-slate-900 truncate">{row.drawingName}</div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
                              <div>计划送审：{row.plannedSubmitDate || '—'}</div>
                              <div>实际送审：{row.actualSubmitDate || '—'}</div>
                              <div>计划通过：{row.plannedPassDate || '—'}</div>
                              <div>实际通过：{row.actualPassDate || '—'}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <ListChecks className="h-4 w-4 text-blue-600" />
                      关联承载
                    </div>
                    <div className="space-y-3 text-sm text-slate-600">
                      <div>
                        <div className="mb-2 font-medium text-slate-900">任务联动</div>
                        <LinkedTaskList tasks={detail.linkedTasks} />
                      </div>
                      <div>
                        <div className="mb-2 font-medium text-slate-900">验收前置</div>
                        <LinkedAcceptanceList acceptance={detail.linkedAcceptance} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Card className="border-slate-200 shadow-sm">
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      自动问题识别
                    </div>
                    <SignalList
                      signals={detail.issueSignals}
                      emptyText="当前没有自动识别的问题。"
                      actionLabel="升级为问题"
                      onAction={onCreateIssue}
                    />
                  </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <TriangleAlert className="h-4 w-4 text-amber-600" />
                      自动风险识别
                    </div>
                    <SignalList
                      signals={detail.riskSignals}
                      emptyText="当前没有自动识别的风险。"
                      actionLabel="升级为风险"
                      onAction={onCreateRisk}
                    />
                  </CardContent>
                </Card>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Card className="border-slate-200 shadow-sm">
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <RefreshCw className="h-4 w-4 text-slate-500" />
                      历史记录
                    </div>
                    <div className="space-y-2">
                      {detail.drawings.map((row) => (
                        <div
                          key={row.drawingId}
                          className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium text-slate-900">{row.drawingName}</div>
                            <div className="text-xs text-slate-500">v{row.versionNo}</div>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                            <span>{row.drawingStatus}</span>
                            <span>{row.reviewStatus}</span>
                            {row.hasChange && <span>有变更</span>}
                            {row.scheduleImpactFlag && <span>工期影响</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                      <Plus className="h-4 w-4 text-slate-500" />
                      版本联动
                    </div>
                    <div className="grid gap-2 text-sm text-slate-600">
                      <div>
                        任务联动：
                        {detail.linkedTasks.length > 0 ? `${detail.linkedTasks.length} 个任务` : '暂无联动任务'}
                      </div>
                      <div>
                        验收联动：
                        {detail.linkedAcceptance.length > 0 ? `${detail.linkedAcceptance.length} 个验收前置` : '暂无联动验收'}
                      </div>
                      <div>当前记录：{detail.records.length} 条版本记录</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={onOpenVersions}>
                      <Plus className="mr-2 h-4 w-4" />
                      打开版本变更窗口
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function LinkedTaskList({ tasks }: { tasks: DrawingLinkedTaskView[] }) {
  if (tasks.length === 0) {
    return <div className="text-sm text-slate-500">暂无任务联动。</div>
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <div key={task.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-slate-900">{task.name}</div>
            <Badge variant="secondary" className="rounded-full px-2.5 py-1 text-xs">
              {task.status}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {task.drawingConditionCount} 个图纸条件，{task.openConditionCount} 个未满足
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {task.conditions.map((condition) => (
              <Badge key={condition.id} variant={condition.isSatisfied ? 'secondary' : 'destructive'} className="rounded-full px-2 py-1 text-[11px]">
                {condition.name}
              </Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function LinkedAcceptanceList({ acceptance }: { acceptance: DrawingLinkedAcceptanceView[] }) {
  if (acceptance.length === 0) {
    return <div className="text-sm text-slate-500">暂无验收前置。</div>
  }

  return (
    <div className="space-y-2">
      {acceptance.map((plan) => (
        <div key={plan.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-slate-900">{plan.name}</div>
            <Badge variant="secondary" className="rounded-full px-2.5 py-1 text-xs">
              {plan.status}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {plan.requirementCount} 个前置要求，{plan.openRequirementCount} 个未满足
            {plan.latestRecordAt ? `，最近记录 ${plan.latestRecordAt}` : ''}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {plan.requirements.map((requirement) => (
              <Badge key={requirement.id} variant={requirement.status === 'met' ? 'secondary' : 'outline'} className="rounded-full px-2 py-1 text-[11px]">
                {requirement.requirementType}
              </Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function SignalList({
  signals,
  emptyText,
  actionLabel,
  onAction,
}: {
  signals: DrawingSignalView[]
  emptyText: string
  actionLabel: string
  onAction?: (signal: DrawingSignalView) => void
}) {
  if (signals.length === 0) {
    return <div className="text-sm text-slate-500">{emptyText}</div>
  }

  return (
    <div className="space-y-2">
      {signals.map((signal) => (
        <div key={signal.code} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium text-slate-900">{signal.title}</div>
              <div className="mt-1 text-xs text-slate-500">{signal.description}</div>
            </div>
            {onAction ? (
              <Button
                size="sm"
                variant="outline"
                data-testid={`drawing-signal-upgrade-${signal.code}`}
                disabled={Boolean(signal.escalatedEntityId)}
                onClick={() => onAction(signal)}
              >
                {signal.escalatedEntityId ? '已升级' : actionLabel}
              </Button>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge
              variant={signal.severity === 'critical' ? 'destructive' : signal.severity === 'high' ? 'default' : 'secondary'}
              className="rounded-full px-2 py-1 text-[11px]"
            >
              {signal.severity}
            </Badge>
            {signal.evidence.map((evidence) => (
              <Badge key={evidence} variant="outline" className="rounded-full px-2 py-1 text-[11px]">
                {evidence}
              </Badge>
            ))}
            {signal.escalatedEntityId ? (
              <Badge className="rounded-full border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">
                {escalationLabel(signal)}
              </Badge>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-medium text-slate-900">{value}</div>
    </div>
  )
}
