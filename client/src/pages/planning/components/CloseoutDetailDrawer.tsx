import { useMemo } from 'react'
import { AlertTriangle, Lock, RefreshCw, Users2, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useDialogFocusRestore } from '@/hooks/useDialogFocusRestore'
import { cn } from '@/lib/utils'
import type { CloseoutConfirmMode } from './CloseoutConfirmDialog'
import type { CloseoutItem } from './CloseoutGroupedList'

export type CloseoutReasonBranch = 'system' | 'manual' | 'escalation'

interface CloseoutDetailDrawerProps {
  open: boolean
  item: CloseoutItem | null
  selectedItems: CloseoutItem[]
  batchLayerOpen: boolean
  forceCloseUnlocked: boolean
  reasonBranch: CloseoutReasonBranch
  reasonLeaf: string
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
    label: '按系统建议',
    description: '适用于正常月份的快速采纳路径。',
    leaves: ['采纳系统建议', '确认无其他变更'],
  },
  {
    branch: 'manual',
    label: '补录关闭原因',
    description: '适用于需要补充说明的事项。',
    leaves: ['资料已补齐', '线下确认完成', '等待补件'],
  },
  {
    branch: 'escalation',
    label: '升级复核',
    description: '适用于并发、过期或超期事项。',
    leaves: ['提交项目负责人复核', '提交公司管理员复核'],
  },
]

function ReasonCascader({
  branch,
  leaf,
  onSelectBranch,
  onSelectLeaf,
}: {
  branch: CloseoutReasonBranch
  leaf: string
  onSelectBranch: (branch: CloseoutReasonBranch) => void
  onSelectLeaf: (leaf: string) => void
}) {
  const active = REASON_TREE.find((item) => item.branch === branch) ?? REASON_TREE[0]

  return (
    <div data-testid="closeout-reason-cascader" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="space-y-1">
        <div className="text-sm font-medium text-slate-900">关闭原因级联</div>
        <p className="text-xs leading-5 text-slate-500">{active.description}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {REASON_TREE.map((option) => (
          <Button
            key={option.branch}
            type="button"
            variant={branch === option.branch ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              onSelectBranch(option.branch)
              onSelectLeaf(option.leaves[0])
            }}
            className="rounded-full"
            data-testid={`closeout-reason-branch-${option.branch}`}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {active.leaves.map((item) => (
          <Button
            key={item}
            type="button"
            variant={leaf === item ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => onSelectLeaf(item)}
            className="justify-start rounded-2xl"
            data-testid={`closeout-reason-leaf-${item}`}
          >
            {item}
          </Button>
        ))}
      </div>

      <div className="text-xs text-slate-500">
        当前分支：<span className="font-medium text-slate-900">{active.label}</span> · 已选原因：
        <span className="font-medium text-slate-900"> {leaf}</span>
      </div>
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
  onClose,
  onToggleBatchLayer,
  onSelectReasonBranch,
  onSelectReasonLeaf,
  onProcessCurrentItem,
  onProcessSelectedItems,
}: CloseoutDetailDrawerProps) {
  useDialogFocusRestore(open)
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
        'sticky top-4 flex h-[calc(100vh-180px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-all',
        open ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-90',
        batchLayerOpen ? 'pointer-events-none opacity-70' : ''
      )}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-slate-900">处理抽屉</div>
          <div className="text-xs text-slate-500">逐条处理与批量补录共用同一套草稿源。</div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} className="gap-2">
          <X className="h-4 w-4" />
          关闭
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {forceCloseUnlocked ? (
          <div className="flex items-start gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-800">
            <Lock className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-1">
              <div className="font-medium">第 7 日强制发起关账已解锁</div>
              <p>该入口只解除发起权限，不会自动替代逐条处理和原因补录。</p>
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
              <p>这条事项已经被其他成员处理，请刷新后再做最终确认。</p>
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
              <p>当前清单与最新关账状态存在时间偏移，需要重新校核后再继续。</p>
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
              <p>该事项已超过建议处理窗口，请优先完成升级确认或留痕。</p>
            </div>
          </div>
        ) : null}

        <Card className="border-slate-200">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-semibold text-slate-900">{item?.title ?? '请选择关账事项'}</div>
                <p className="text-xs leading-5 text-slate-500">
                  {item?.summary ?? '抽屉会展示逐条处理、批量补录和确认动作。'}
                </p>
              </div>
              <Badge variant="outline">{item?.systemSuggestion ?? '待选择'}</Badge>
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

            <ReasonCascader
              branch={reasonBranch}
              leaf={reasonLeaf}
              onSelectBranch={onSelectReasonBranch}
              onSelectLeaf={onSelectReasonLeaf}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="default"
                onClick={onProcessCurrentItem}
                className="gap-2"
                data-testid="closeout-single-process-entry"
              >
                处理当前条目
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onToggleBatchLayer(!batchLayerOpen)}
                data-testid="closeout-batch-layer-toggle"
              >
                {batchLayerOpen ? '收起批量补录层' : '打开批量补录层'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {batchLayerOpen ? (
          <div
            data-testid="closeout-batch-close-layer"
            className="space-y-3 rounded-2xl border border-dashed border-cyan-300 bg-cyan-50/60 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-slate-900">批量关闭补录层</div>
                <p className="text-xs text-slate-500">
                  已选择 {selectedItems.length} 项，强制关账也不会跳过逐条处理和原因补录。
                </p>
              </div>
              <Badge variant="secondary">补录中</Badge>
            </div>

            <div className="grid gap-2">
              {selectedItems.length ? (
                selectedItems.map((selected) => (
                  <div
                    key={selected.id}
                    className="flex items-center justify-between rounded-xl border border-white/80 bg-white px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-slate-900">{selected.title}</span>
                    <span className="text-xs text-slate-500">{selected.systemSuggestion}</span>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-white/80 bg-white px-3 py-2 text-sm text-slate-500">
                  尚未选择条目，先在左侧清单勾选后再进行批量关闭。
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={onProcessSelectedItems}
                disabled={!selectedItems.length}
                data-testid="closeout-batch-process-entry"
              >
                处理所选项
              </Button>
              <Button type="button" variant="outline" onClick={() => onToggleBatchLayer(false)}>
                稍后处理
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
