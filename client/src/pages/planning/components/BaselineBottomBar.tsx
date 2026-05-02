import { useRef } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DisabledReasonTooltip } from '@/components/ui/disabled-reason-tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Download, History, MoreHorizontal, RotateCcw, RotateCw, Save } from 'lucide-react'

interface BaselineBottomBarProps {
  isDirty: boolean
  readOnly: boolean
  lockRemainingLabel: string
  lastSavedLabel: string
  canUndo: boolean
  canRedo: boolean
  saveDisabled?: boolean
  saveDisabledReason?: string | null
  saving?: boolean
  selectedCount?: number
  batchShiftDays?: string
  batchProgressValue?: string
  onBatchShiftDaysChange?: (value: string) => void
  onBatchProgressValueChange?: (value: string) => void
  onBatchDelete?: () => void
  onBatchShift?: (value?: string) => void
  onBatchSetProgress?: (value?: string) => void
  onOpenConfirm?: () => void
  confirmDisabled?: boolean
  confirmDisabledReason?: string | null
  onUndo: () => void
  onRedo: () => void
  onSaveDraft: () => void
}

export function BaselineBottomBar({
  isDirty,
  readOnly,
  lockRemainingLabel,
  lastSavedLabel,
  canUndo,
  canRedo,
  saveDisabled = false,
  saveDisabledReason = null,
  saving = false,
  selectedCount = 0,
  batchShiftDays = '1',
  batchProgressValue = '',
  onBatchShiftDaysChange,
  onBatchProgressValueChange,
  onBatchDelete,
  onBatchShift,
  onBatchSetProgress,
  onOpenConfirm,
  confirmDisabled = false,
  confirmDisabledReason = null,
  onUndo,
  onRedo,
  onSaveDraft,
}: BaselineBottomBarProps) {
  const batchShiftInputRef = useRef<HTMLInputElement | null>(null)
  const batchProgressInputRef = useRef<HTMLInputElement | null>(null)
  const hasBatchActions =
    !readOnly &&
    selectedCount > 0 &&
    (Boolean(onBatchDelete) || Boolean(onBatchShift) || Boolean(onBatchSetProgress))
  const resolvedSaveDisabledReason =
    saveDisabledReason ?? (readOnly ? '请先进入编辑模式或获取编辑锁。' : saveDisabled ? '需先选择至少 1 项基线条目。' : null)
  const resolvedConfirmDisabledReason =
    confirmDisabledReason ?? (readOnly ? '请先进入编辑模式或获取编辑锁。' : confirmDisabled ? '请先保存草稿。' : null)

  return (
    <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-[var(--content-max-width)] -translate-x-1/2 px-0">
      <Card
        data-testid="baseline-bottom-bar"
        className={cn(
          'border-slate-700/70 bg-slate-950 px-4 py-3 text-white shadow-[var(--el-4)] shadow-slate-950/30',
        )}
      >
        <div className="flex flex-col gap-3">
          <div className="grid items-center gap-3 lg:grid-cols-[minmax(16.25rem,1fr)_auto_minmax(16.25rem,1fr)]">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold',
                  isDirty ? 'bg-amber-400 text-slate-950' : 'bg-slate-700 text-slate-100',
                )}
              >
                {isDirty ? '未保存' : '已保存'}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2 rounded-full border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
                onClick={onUndo}
                disabled={readOnly || !canUndo}
              >
                <RotateCcw className="h-4 w-4" />
                撤销
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2 rounded-full border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
                onClick={onRedo}
                disabled={readOnly || !canRedo}
              >
                <RotateCw className="h-4 w-4" />
                重做
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2 rounded-full border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
                disabled
              >
                <Download className="h-4 w-4" />
                导出
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2 rounded-full border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
                disabled
              >
                <History className="h-4 w-4" />
                历史
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-2 rounded-full border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                    更多操作
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuLabel>批量辅助</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onBatchDelete} disabled={selectedCount === 0 || !onBatchDelete}>
                    批量删除
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onBatchShift?.(batchShiftInputRef.current?.value ?? batchShiftDays)}
                    disabled={selectedCount === 0 || !onBatchShift}
                  >
                    平移日期
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onBatchSetProgress?.(batchProgressInputRef.current?.value ?? batchProgressValue)}
                    disabled={selectedCount === 0 || !onBatchSetProgress}
                  >
                    设目标进度
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="justify-self-center rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100">
              已选 {selectedCount} 项
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <DisabledReasonTooltip reason={readOnly || saveDisabled ? resolvedSaveDisabledReason : null}>
                <Button
                  type="button"
                  size="sm"
                  className="gap-2 rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  onClick={onSaveDraft}
                  disabled={readOnly || saveDisabled}
                  loading={saving}
                >
                  <Save className="h-4 w-4" />
                  保存草稿
                </Button>
              </DisabledReasonTooltip>
              {onOpenConfirm ? (
                readOnly || confirmDisabled ? (
                  <DisabledReasonTooltip reason={resolvedConfirmDisabledReason}>
                    <Button
                      type="button"
                      size="sm"
                      className="gap-2 rounded-full bg-blue-600 text-white hover:bg-blue-500"
                      disabled
                    >
                      确认项目基线
                    </Button>
                  </DisabledReasonTooltip>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    className="gap-2 rounded-full bg-blue-600 text-white hover:bg-blue-500"
                    onClick={onOpenConfirm}
                  >
                    确认项目基线
                  </Button>
                )
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
            <span>基线草稿收口</span>
            <span>锁剩余 {lockRemainingLabel}</span>
            <span>最近暂存 {lastSavedLabel}</span>
          </div>

          {hasBatchActions ? (
            <div
              data-testid="baseline-batch-bar"
              className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/80 px-3 py-3"
            >
              <span className="text-xs font-medium text-slate-200">批量处理 {selectedCount} 项</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
                onClick={onBatchDelete}
                disabled={selectedCount === 0}
              >
                批量删除
              </Button>
              <div className="flex items-center gap-2">
                <Input
                  ref={batchShiftInputRef}
                  value={batchShiftDays}
                  onChange={(event) => onBatchShiftDaysChange?.(event.target.value)}
                  aria-label="批量平移天数"
                  className="h-8 w-20 border-slate-700 bg-slate-950 text-white"
                  inputMode="numeric"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
                  onClick={() => onBatchShift?.(batchShiftInputRef.current?.value ?? batchShiftDays)}
                  disabled={selectedCount === 0}
                >
                  平移日期
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  ref={batchProgressInputRef}
                  value={batchProgressValue}
                  onChange={(event) => onBatchProgressValueChange?.(event.target.value)}
                  aria-label="批量目标进度"
                  className="h-8 w-24 border-slate-700 bg-slate-950 text-white"
                  inputMode="numeric"
                  placeholder="0-100"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
                  onClick={() =>
                    onBatchSetProgress?.(batchProgressInputRef.current?.value ?? batchProgressValue)
                  }
                  disabled={selectedCount === 0}
                >
                  设目标进度
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
