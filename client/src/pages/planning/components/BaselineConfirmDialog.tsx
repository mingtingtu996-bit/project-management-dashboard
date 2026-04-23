import { useEffect, useMemo, useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { AlertTriangle, CheckCircle2, Clock3, FileDiff, FolderGit2, RotateCcw, ShieldAlert } from 'lucide-react'

import { BaselineDiffView, type BaselineDiffItem, type BaselineDiffKind } from './BaselineDiffView'

export type BaselineConfirmState = 'ready' | 'stale' | 'failed'

export interface BaselineConfirmSummary {
  fromVersionLabel: string
  toVersionLabel: string
  items: BaselineDiffItem[]
}

export interface BaselineConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  summary: BaselineConfirmSummary
  state?: BaselineConfirmState
  failureCode?: string | null
  failureMessage?: string | null
  canConfirm?: boolean
  confirmDisabledReason?: string | null
  confirming?: boolean
  onConfirm?: () => void
  onRetry?: () => void
  canQueueRealignment?: boolean
  onQueueRealignment?: () => void
  onOpenRevisionPool?: () => void
}

const kindMeta: Record<BaselineDiffKind, { label: string }> = {
  新增: { label: '新增' },
  修改: { label: '修改' },
  移除: { label: '移除' },
  里程碑变动: { label: '里程碑变动' },
}

type RealignmentMetric = {
  label: string
  value: string
  emphasis?: 'warning' | 'critical'
}

type RealignmentFailureSummary = {
  metrics: RealignmentMetric[]
  triggeredRules: string[]
}

function buildCounts(items: BaselineDiffItem[]) {
  return items.reduce(
    (acc, item) => {
      acc[item.kind] += 1
      acc.total += 1
      return acc
    },
    { total: 0, 新增: 0, 修改: 0, 移除: 0, 里程碑变动: 0 },
  )
}

function parseRealignmentFailureSummary(message: string | null): RealignmentFailureSummary | null {
  if (!message) return null

  const taskRatioMatch = message.match(/任务偏差率\s*(\d+)%/)
  const milestoneShiftMatch = message.match(/里程碑偏移\s*(\d+)\s*个、平均\s*(\d+)\s*天/)
  const durationDeviationMatch = message.match(/总工期偏差\s*(\d+)%/)
  const rulesMatch = message.match(/触发规则：(.+?)。(?:请先|可先|建议)/)

  const metrics: RealignmentMetric[] = []
  if (taskRatioMatch) {
    metrics.push({ label: '任务偏差率', value: `${taskRatioMatch[1]}%`, emphasis: 'critical' })
  }
  if (milestoneShiftMatch) {
    metrics.push({
      label: '里程碑偏移',
      value: `${milestoneShiftMatch[1]} 个 / 平均 ${milestoneShiftMatch[2]} 天`,
      emphasis: Number(milestoneShiftMatch[1]) > 0 ? 'warning' : undefined,
    })
  }
  if (durationDeviationMatch) {
    metrics.push({ label: '总工期偏差', value: `${durationDeviationMatch[1]}%`, emphasis: 'critical' })
  }

  const triggeredRules = rulesMatch?.[1]
    ? rulesMatch[1]
        .split('、')
        .map((item) => item.trim())
        .filter(Boolean)
    : []

  if (!metrics.length && !triggeredRules.length) return null
  return { metrics, triggeredRules }
}

export function BaselineConfirmDialog({
  open,
  onOpenChange,
  summary,
  state = 'ready',
  failureCode = null,
  failureMessage = null,
  canConfirm = true,
  confirmDisabledReason,
  confirming = false,
  onConfirm,
  onRetry,
  canQueueRealignment = false,
  onQueueRealignment,
  onOpenRevisionPool,
}: BaselineConfirmDialogProps) {
  const [showDiff, setShowDiff] = useState(false)

  useEffect(() => {
    if (!open) setShowDiff(false)
  }, [open])

  const counts = useMemo(() => buildCounts(summary.items), [summary.items])
  const isRealignmentFailure = state === 'failed' && failureCode === 'REQUIRES_REALIGNMENT'
  const realignmentSummary = useMemo(
    () => (isRealignmentFailure ? parseRealignmentFailureSummary(failureMessage) : null),
    [failureMessage, isRealignmentFailure],
  )
  const resolvedConfirmDisabledReason =
    confirmDisabledReason ?? (state === 'ready' && !canConfirm ? '当前存在阻断项，修正后才能确认发布。' : null)
  const statusMeta = {
    ready: {
      label: '可确认',
      tone: 'secondary' as const,
      icon: CheckCircle2,
      description: '先看数字摘要和分类计数，再决定是否展开完整差异。',
    },
    stale: {
      label: '版本过期并发态',
      tone: 'outline' as const,
      icon: ShieldAlert,
      description: '当前版本已过期，请先刷新或重新载入后再继续确认。',
    },
    failed: {
      label: '发布失败态',
      tone: 'destructive' as const,
      icon: AlertTriangle,
      description: isRealignmentFailure
        ? '当前版本已触发待重整阈值，请先处理重排或修订动作，再回到确认流程。'
        : '上次发布失败，草稿已保留，可在修正后重试。',
    },
  }[state]
  const StatusIcon = statusMeta.icon

  const openDiff = () => setShowDiff(true)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileDiff className="h-4 w-4 text-cyan-500" />
            基线确认弹窗
          </DialogTitle>
          <DialogDescription className="sr-only">
            查看当前基线版本摘要、变更分类计数和完整差异视图，再决定是否确认发布。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusMeta.tone} className="gap-1">
              <StatusIcon className="h-3.5 w-3.5" />
              {statusMeta.label}
            </Badge>
            <Badge variant="outline">{summary.fromVersionLabel} → {summary.toVersionLabel}</Badge>
            <Badge variant="secondary">{counts.total} 处变更</Badge>
          </div>

          <Alert
            variant={state === 'failed' ? 'destructive' : 'default'}
            className={cn(state === 'stale' ? 'border-amber-200 bg-amber-50 text-amber-900' : '')}
          >
            <Clock3 className="h-4 w-4" />
            <AlertDescription>{statusMeta.description}</AlertDescription>
          </Alert>

          {state === 'failed' && failureMessage ? (
            <Alert
              className={cn(
                isRealignmentFailure
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-rose-200 bg-rose-50 text-rose-900',
              )}
            >
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-3">
                  <p className="text-sm leading-6">{failureMessage}</p>
                  {realignmentSummary ? (
                    <div
                      data-testid="baseline-confirm-realignment-summary"
                      className="space-y-3 rounded-2xl border border-amber-200/80 bg-white/85 p-3 shadow-sm"
                    >
                      <div>
                        <div className="text-sm font-medium text-slate-900">触发摘要</div>
                        <p className="text-xs leading-5 text-slate-600">
                          系统已判定当前版本需要先进入待重整处理，先看下面这些关键指标，再决定走重排还是修订。
                        </p>
                      </div>
                      {realignmentSummary.metrics.length ? (
                        <div className="grid gap-2 md:grid-cols-3">
                          {realignmentSummary.metrics.map((metric) => (
                            <Card
                              key={metric.label}
                              className={cn(
                                'border-amber-100 bg-amber-50/60 shadow-none',
                                metric.emphasis === 'critical' ? 'ring-1 ring-rose-200' : '',
                                metric.emphasis === 'warning' ? 'ring-1 ring-amber-200' : '',
                              )}
                            >
                              <CardContent className="space-y-1 p-3">
                                <div className="text-xs text-slate-500">{metric.label}</div>
                                <div className="text-base font-semibold text-slate-900">{metric.value}</div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : null}
                      {realignmentSummary.triggeredRules.length ? (
                        <div className="space-y-2">
                          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                            触发规则
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {realignmentSummary.triggeredRules.map((rule) => (
                              <Badge key={rule} variant="outline" className="border-amber-300 bg-white text-amber-900">
                                {rule}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {isRealignmentFailure ? (
                    <div className="flex flex-wrap gap-2">
                      {onOpenRevisionPool ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2 border-amber-300 bg-white/80 text-amber-900 hover:bg-amber-100"
                          data-testid="baseline-confirm-open-revision-pool"
                          onClick={onOpenRevisionPool}
                        >
                          <FolderGit2 className="h-4 w-4" />
                          打开计划修订候选
                        </Button>
                      ) : null}
                      {canQueueRealignment && onQueueRealignment ? (
                        <Button
                          type="button"
                          size="sm"
                          className="gap-2"
                          data-testid="baseline-confirm-queue-realignment"
                          onClick={onQueueRealignment}
                        >
                          <RotateCcw className="h-4 w-4" />
                          声明开始重排
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          {state === 'ready' && resolvedConfirmDisabledReason ? (
            <Alert className="border-rose-200 bg-rose-50 text-rose-900">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>{resolvedConfirmDisabledReason}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="space-y-1 p-4">
                <div className="text-xs text-slate-500">当前版本</div>
                <div className="text-2xl font-semibold text-slate-900">{summary.fromVersionLabel}</div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="space-y-1 p-4">
                <div className="text-xs text-slate-500">目标版本</div>
                <div className="text-2xl font-semibold text-slate-900">{summary.toVersionLabel}</div>
              </CardContent>
            </Card>
            {(['新增', '修改', '移除', '里程碑变动'] as BaselineDiffKind[]).map((kind) => (
              <Card key={kind} className="border-slate-200 shadow-sm">
                <CardContent className="space-y-1 p-4">
                  <div className="text-xs text-slate-500">{kindMeta[kind].label}</div>
                  <div className="text-2xl font-semibold text-slate-900">{counts[kind]}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-900">首屏摘要</div>
                <p className="text-sm leading-6 text-slate-600">
                  这里先展示数字摘要和分类计数，不在首屏直接塞对比表。
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={openDiff}>
                <FileDiff className="h-4 w-4" />
                查看完整差异
              </Button>
            </div>
          </div>

          {showDiff ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <BaselineDiffView
                fromVersionLabel={summary.fromVersionLabel}
                toVersionLabel={summary.toVersionLabel}
                items={summary.items}
              />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-2">
            {state === 'failed' && !isRealignmentFailure ? (
              <Button type="button" variant="destructive" className="gap-2" onClick={onRetry}>
                <RotateCcw className="h-4 w-4" />
                重新尝试
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {isRealignmentFailure ? '回到草稿继续处理' : '关闭'}
            </Button>
            <Button
              type="button"
              onClick={onConfirm}
              disabled={confirming || state === 'stale' || Boolean(resolvedConfirmDisabledReason) || isRealignmentFailure}
            >
              {confirming ? '发布中...' : state === 'failed' && !isRealignmentFailure ? '继续重试发布' : '确认发布'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default BaselineConfirmDialog
