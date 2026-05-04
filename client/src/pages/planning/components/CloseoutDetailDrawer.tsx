import { useMemo } from 'react'
import { AlertTriangle, Lock, RefreshCw, Users2, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useDialogFocusRestore } from '@/hooks/useDialogFocusRestore'
import { cn } from '@/lib/utils'
import type { CloseoutItem } from './CloseoutGroupedList'

export type CloseoutReasonBranch = 'system' | 'carryover' | 'close' | 'manual' | 'force'

interface CloseoutDetailDrawerProps {
  open: boolean
  item: CloseoutItem | null
  selectedItems: CloseoutItem[]
  batchLayerOpen: boolean
  forceCloseUnlocked: boolean
  reasonBranch: CloseoutReasonBranch
  reasonLeaf: string
  readOnly?: boolean
  onClose: () => void
  onToggleBatchLayer: (open: boolean) => void
  onSelectReasonBranch: (branch: CloseoutReasonBranch) => void
  onSelectReasonLeaf: (leaf: string) => void
  onProcessCurrentItem: () => void
  onProcessSelectedItems: () => void
}

const REASON_TREE: Array<{
  branch: CloseoutReasonBranch
  label: string
  description: string
  leaves: string[]
}> = [
  {
    branch: 'system',
    label: '当月已消化关闭',
    description: '适用于当月已完成、可直接关闭的事项。',
    leaves: ['确认已完成', '继续保持关闭'],
  },
  {
    branch: 'carryover',
    label: '条目延后至后续阶段',
    description: '适用于需要延后到后续阶段继续处理的事项。',
    leaves: ['延后至下月', '等待后续阶段'],
  },
  {
    branch: 'close',
    label: '条目取消或不再需要',
    description: '适用于已取消或后续无需继续跟踪的事项。',
    leaves: ['确认取消', '标记不再需要'],
  },
  {
    branch: 'manual',
    label: '条目合并到其他条目',
    description: '适用于当前条目已被其他条目承接或合并的场景。',
    leaves: ['合并到其他条目', '转移至承接项'],
  },
  {
    branch: 'force',
    label: '因范围变更移出',
    description: '适用于范围收缩或边界变更导致移出的事项。',
    leaves: ['按范围变更移出', '从本月清单移除'],
  },
]

function ReasonCascader({
  branch,
  leaf,
  onSelectBranch,
  onSelectLeaf,
  readOnly = false,
}: {
  branch: CloseoutReasonBranch
  leaf: string
  onSelectBranch: (branch: CloseoutReasonBranch) => void
  onSelectLeaf: (leaf: string) => void
  readOnly?: boolean
}) {
  const active = REASON_TREE.find((item) => item.branch === branch) ?? REASON_TREE[0]
  const activeLeaf = active.leaves.includes(leaf) ? leaf : active.leaves[0]
  const breadcrumb = ['根', active.label, activeLeaf]

  return (
    <div data-testid="closeout-reason-cascader" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="space-y-1">
        <div className="text-sm font-medium text-slate-900">关闭原因级联</div>
        <div data-testid="closeout-reason-breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
          {breadcrumb.map((part, index) => (
            <span key={`${part}-${index}`} className={cn(index > 0 && 'inline-flex items-center gap-1')}>
              {index > 0 ? <span className="text-slate-500">&gt;</span> : null}
              <span className={index === breadcrumb.length - 1 ? 'font-medium text-blue-700' : ''}>{part}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {REASON_TREE.map((option) => (
          <Button
            key={option.branch}
            type="button"
            variant="outline"
            disabled={readOnly}
            onClick={() => {
              onSelectBranch(option.branch)
              onSelectLeaf(option.leaves[0])
            }}
            className={cn(
              'h-auto min-w-0 justify-start whitespace-normal rounded-xl px-3 py-2 text-left',
              branch === option.branch
                ? 'border-blue-500 bg-blue-50 text-blue-900 hover:bg-blue-50'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            )}
            data-testid={`closeout-reason-branch-${option.branch}`}
          >
            <span className="flex min-w-0 w-full flex-col items-start gap-1">
              <span className="flex w-full min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate">{option.label}</span>
                <Badge variant="outline" className="shrink-0 bg-white text-slate-600">
                  {option.leaves.length}
                </Badge>
              </span>
              <span className="whitespace-normal break-words text-xs font-normal leading-5 text-slate-500">{option.description}</span>
            </span>
          </Button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {active.leaves.map((item) => (
          <Button
            key={item}
            type="button"
            variant="outline"
            size="sm"
            disabled={readOnly}
            onClick={() => onSelectLeaf(item)}
            className={cn(
              'w-full min-w-0 justify-between gap-2 rounded-xl px-3',
              leaf === item
                ? 'border-blue-500 bg-blue-50 text-blue-900 hover:bg-blue-50'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            )}
            data-testid={`closeout-reason-leaf-${item}`}
          >
            <span className="min-w-0 truncate">{item}</span>
            <Badge variant="outline" className="shrink-0 bg-white text-slate-500">
              0
            </Badge>
          </Button>
        ))}
      </div>

      <div className="text-xs text-slate-500">
        当前分支：<span className="font-medium text-slate-900">{active.label}</span> · 已选原因：
        <span className="font-medium text-slate-900"> {activeLeaf}</span>
      </div>
    </div>
  )
}

function SnapshotField({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-slate-50 px-3 py-2', className)}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
    </div>
  )
}

export function CloseoutDetailDrawer({
  open,
  item,
  selectedItems,
  batchLayerOpen,
  forceCloseUnlocked,
  reasonBranch,
  reasonLeaf,
  readOnly = false,
  onClose,
  onToggleBatchLayer,
  onSelectReasonBranch,
  onSelectReasonLeaf,
  onProcessCurrentItem,
  onProcessSelectedItems,
}: CloseoutDetailDrawerProps) {
  useDialogFocusRestore(open)
  const editable = !readOnly
  const visibleBanners = useMemo(
    () => ({
      concurrency: item?.status === 'concurrency' || selectedItems.some((entry) => entry.status === 'concurrency'),
      stale: item?.status === 'stale' || selectedItems.some((entry) => entry.status === 'stale'),
      overdue: item?.status === 'overdue' || selectedItems.some((entry) => entry.status === 'overdue'),
    }),
    [item, selectedItems]
  )

  return (
    <aside
      data-testid="closeout-detail-drawer"
      aria-disabled={batchLayerOpen ? 'true' : undefined}
      className={cn(
        'surface-card sticky top-4 flex h-[calc(100vh-11.25rem)] flex-col overflow-hidden transition-all',
        open ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-90',
        batchLayerOpen ? 'pointer-events-none opacity-70' : ''
      )}
    >
      <div data-testid="closeout-detail-drawer-header" className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0 space-y-1">
          <div className="truncate text-sm font-semibold text-slate-900">{item?.title ?? '请选择关账事项'}</div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{item?.systemSuggestion ?? '待选择'}</Badge>
            {item?.commitmentLabel ? <Badge variant="secondary">{item.commitmentLabel}</Badge> : null}
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} className="gap-2">
          <X className="h-4 w-4" />
          关闭
        </Button>
      </div>
      <Separator />

      <div data-testid="closeout-detail-drawer-body" className="flex-1 space-y-4 overflow-y-auto p-4">
        {forceCloseUnlocked ? (
          <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <Lock className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-1">
              <div className="font-medium">第 7 日强制发起关账已解锁</div>
            </div>
          </div>
        ) : null}

        {visibleBanners.concurrency ? (
          <div
            data-testid="closeout-concurrency-banner"
            className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
          >
            <Users2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-1">
              <div className="font-medium">他人已先处理</div>
            </div>
          </div>
        ) : null}

        {visibleBanners.stale ? (
          <div
            data-testid="closeout-stale-banner"
            className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
          >
            <RefreshCw className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-1">
              <div className="font-medium">清单已过期</div>
            </div>
          </div>
        ) : null}

        {visibleBanners.overdue ? (
          <div
            data-testid="closeout-overdue-banner"
            className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-1">
              <div className="font-medium">已进入超期升级态</div>
            </div>
          </div>
        ) : null}

        <Card className="border-slate-200">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">基本信息</div>
                {item?.summary ? <p className="text-xs leading-5 text-slate-500">{item.summary}</p> : null}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-xs text-slate-500">来源层级</div>
                <div className="mt-1 text-sm font-medium text-slate-900">{item?.sourceHierarchyLabel ?? '待识别'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-xs text-slate-500">来源类型</div>
                <div className="mt-1 text-sm font-medium text-slate-900">{item?.sourceEntityLabel ?? '待识别'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-xs text-slate-500">当前关闭口径</div>
                <div className="mt-1 text-sm font-medium text-slate-900">{(reasonLeaf || item?.closeReasonLabel) ?? '待选择'}</div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-slate-900">关联任务</div>
                <Badge variant="secondary">月计划 / 当前排期</Badge>
              </div>
              {(() => {
                const planStart = item?.planStartLabel ?? '未设置'
                const planEnd = item?.planEndLabel ?? '未设置'
                const planProgress = item?.planProgressLabel ?? '未设置'
                const taskStart = item?.taskStartLabel ?? '未设置'
                const taskEnd = item?.taskEndLabel ?? '未设置'
                const taskProgress = item?.taskProgressLabel ?? '未设置'
                const hasDiff = planStart !== taskStart || planEnd !== taskEnd || planProgress !== taskProgress

                return (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div
                      className={cn(
                        'space-y-2 rounded-2xl border p-3',
                        hasDiff ? 'border-amber-200 bg-amber-50' : 'border-white/80 bg-white',
                      )}
                    >
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">月计划快照</div>
                      <SnapshotField label="计划开始" value={planStart} />
                      <SnapshotField label="计划结束" value={planEnd} />
                      <SnapshotField label="计划进度" value={planProgress} />
                    </div>
                    <div
                      className={cn(
                        'space-y-2 rounded-2xl border p-3',
                        hasDiff ? 'border-amber-200 bg-amber-50' : 'border-white/80 bg-white',
                      )}
                    >
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">当前排期快照</div>
                      <SnapshotField label="任务名称" value={item?.taskTitle ?? '未关联当前任务'} />
                      <SnapshotField label="计划开始" value={taskStart} />
                      <SnapshotField label="计划结束" value={taskEnd} />
                      <SnapshotField label="当前进度" value={taskProgress} />
                    </div>
                  </div>
                )
              })()}
            </div>

            <Separator />

            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">关闭原因</div>

            <ReasonCascader
              branch={reasonBranch}
              leaf={reasonLeaf}
              onSelectBranch={onSelectReasonBranch}
              onSelectLeaf={onSelectReasonLeaf}
              readOnly={readOnly}
            />
          </CardContent>
        </Card>

        {batchLayerOpen ? (
          <div
            data-testid="closeout-batch-close-layer"
            className="space-y-3 rounded-2xl empty-state-frame border-blue-300 bg-blue-50/60 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-slate-900">批量关闭补录层</div>
              </div>
              <Badge variant="secondary">补录中</Badge>
            </div>

            <div className="grid gap-2">
              {selectedItems.length ? (
                selectedItems.map((selected) => (
                  <Card
                    key={selected.id}
                    className="flex items-center justify-between rounded-xl border border-white/80 bg-white px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-slate-900">{selected.title}</span>
                    <span className="text-xs text-slate-500">{selected.systemSuggestion}</span>
                  </Card>
                ))
              ) : (
                <Card className="rounded-xl border border-white/80 bg-white px-3 py-2" />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={onProcessSelectedItems}
                disabled={!editable || !selectedItems.length}
                data-testid="closeout-batch-process-entry"
              >
                处理所选项
              </Button>
              <Button type="button" variant="outline" onClick={() => onToggleBatchLayer(false)} disabled={!editable}>
                稍后处理
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      <Separator />
      <div data-testid="closeout-detail-drawer-footer" className="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
        <Button type="button" variant="outline" onClick={onClose} disabled={!editable}>
          取消
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onToggleBatchLayer(!batchLayerOpen)}
          data-testid="closeout-batch-layer-toggle"
          disabled={!editable}
        >
          {batchLayerOpen ? '收起批量补录层' : '打开批量补录层'}
        </Button>
        <Button
          type="button"
          variant="default"
          onClick={onProcessCurrentItem}
          className="gap-2"
          data-testid="closeout-single-process-entry"
          disabled={!editable}
        >
          确认关闭当前条目
        </Button>
      </div>
    </aside>
  )
}
