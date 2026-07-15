import type { ReactNode } from 'react'
import { CalendarDays } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface TemplateGenerationOptionsProps {
  includeActivitySteps: boolean
  onIncludeActivityStepsChange: (checked: boolean) => void
  plannedStartDate: string
  onPlannedStartDateChange: (value: string) => void
  scopeReady: boolean
  scopeRequired: boolean
  scopeLabel?: string
  activityStepsLabel: ReactNode
  activityStepsDescription: ReactNode
  plannedStartLabel: ReactNode
  scopeFieldLabel: ReactNode
  taskScopeFallbackLabel: ReactNode
  baselineScopeLabel: ReactNode
}

export function TemplateGenerationOptions({
  includeActivitySteps,
  onIncludeActivityStepsChange,
  plannedStartDate,
  onPlannedStartDateChange,
  scopeReady,
  scopeRequired,
  scopeLabel,
  activityStepsLabel,
  activityStepsDescription,
  plannedStartLabel,
  scopeFieldLabel,
  taskScopeFallbackLabel,
  baselineScopeLabel,
}: TemplateGenerationOptionsProps) {
  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox
            checked={includeActivitySteps}
            onCheckedChange={(checked) => onIncludeActivityStepsChange(checked === true)}
            className="mt-0.5"
          />
          <span className="grid gap-1">
            <span className="text-sm font-medium text-slate-800">{activityStepsLabel}</span>
            <span className="text-xs leading-5 text-slate-500">{activityStepsDescription}</span>
          </span>
        </label>
      </section>

      <section className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700">{plannedStartLabel}</label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="date"
              value={plannedStartDate}
              onChange={(event) => onPlannedStartDateChange(event.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700">{scopeFieldLabel}</label>
          <div
            className={cn(
              'flex min-h-10 items-center rounded-lg border px-3 text-sm',
              scopeReady ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-amber-200 bg-amber-50 text-amber-700',
            )}
          >
            {scopeRequired ? scopeLabel || taskScopeFallbackLabel : baselineScopeLabel}
          </div>
        </div>
      </section>
    </>
  )
}

interface TemplateGenerationDialogFooterProps {
  hasPreview: boolean
  generating: boolean
  canGenerate: boolean
  canApply: boolean
  onBack: () => void
  onCancel: () => void
  onGenerate: () => void
  onApply: () => void
  backLabel: ReactNode
  cancelLabel: ReactNode
  applyLabel: ReactNode
  generateLabel: ReactNode
}

export function TemplateGenerationDialogFooter({
  hasPreview,
  generating,
  canGenerate,
  canApply,
  onBack,
  onCancel,
  onGenerate,
  onApply,
  backLabel,
  cancelLabel,
  applyLabel,
  generateLabel,
}: TemplateGenerationDialogFooterProps) {
  return (
    <DialogFooter className="border-t border-slate-100 px-6 py-4">
      {hasPreview ? (
        <Button type="button" variant="ghost" onClick={onBack}>
          {backLabel}
        </Button>
      ) : null}
      <Button type="button" variant="outline" onClick={onCancel}>
        {cancelLabel}
      </Button>
      {hasPreview ? (
        <Button type="button" onClick={onApply} disabled={!canApply}>
          {applyLabel}
        </Button>
      ) : (
        <Button type="button" onClick={onGenerate} loading={generating} disabled={!canGenerate}>
          {generateLabel}
        </Button>
      )}
    </DialogFooter>
  )
}
