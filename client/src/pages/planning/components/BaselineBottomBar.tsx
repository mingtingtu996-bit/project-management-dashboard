import { useRef } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { RotateCcw, RotateCw, Save } from 'lucide-react'

interface BaselineBottomBarProps {
  isDirty: boolean
  readOnly: boolean
  lockRemainingLabel: string
  lastSavedLabel: string
  canUndo: boolean
  canRedo: boolean
  saveDisabled?: boolean
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
  onUndo,
  onRedo,
  onSaveDraft,
}: BaselineBottomBarProps) {
  const batchShiftInputRef = useRef<HTMLInputElement | null>(null)
  const batchProgressInputRef = useRef<HTMLInputElement | null>(null)
  const hasBatchActions =
    !readOnly &&
    (Boolean(onBatchDelete) || Boolean(onBatchShift) || Boolean(onBatchSetProgress))

  return (
    <div className="fixed bottom-4 left-0 right-0 z-40 px-4">
      <Card
        data-testid="baseline-bottom-bar"
        className={cn(
          'mx-auto max-w-[1440px] border-slate-700/70 bg-slate-950 px-4 py-3 text-white shadow-2xl shadow-slate-950/30',
        )}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  'flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold',
                  isDirty ? 'bg-amber-400 text-slate-950' : 'bg-slate-700 text-slate-100',
                )}
              >
                {isDirty ? '未保存' : '已保存'}
              </span>
              <span className="text-sm font-medium">基线草稿收口</span>
              <span className="text-xs text-slate-300">锁剩余 {lockRemainingLabel}</span>
              <span className="text-xs text-slate-300">最近暂存 {lastSavedLabel}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2 rounded-full border-slate-600 bg-transparent text-slate-100 hover:bg-white/10"
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
                className="gap-2 rounded-full border-slate-600 bg-transparent text-slate-100 hover:bg-white/10"
                onClick={onRedo}
                disabled={readOnly || !canRedo}
              >
                <RotateCw className="h-4 w-4" />
                重做
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-2 rounded-full bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                onClick={onSaveDraft}
                disabled={readOnly || saveDisabled}
              >
                <Save className="h-4 w-4" />
                {saving ? '保存中...' : '保存草稿'}
              </Button>
              {onOpenConfirm ? (
                <Button
                  type="button"
                  size="sm"
                  className="gap-2 rounded-full bg-emerald-500 text-white hover:bg-emerald-400"
                  onClick={onOpenConfirm}
                  disabled={readOnly || confirmDisabled}
                >
                  确认项目基线
                </Button>
              ) : null}
            </div>
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
                className="rounded-full border-slate-600 bg-transparent text-slate-100 hover:bg-white/10"
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
                  className="h-8 w-20 border-slate-700 bg-slate-950 text-white"
                  inputMode="numeric"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full border-slate-600 bg-transparent text-slate-100 hover:bg-white/10"
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
                  className="h-8 w-24 border-slate-700 bg-slate-950 text-white"
                  inputMode="numeric"
                  placeholder="0-100"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full border-slate-600 bg-transparent text-slate-100 hover:bg-white/10"
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
