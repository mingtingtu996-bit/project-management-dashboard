// v1.4.22.1 §7.0.1: Sticky bottom footer with prev/next/save actions.
import type { WizardMode } from './types'
import { getWizardScopeIcon, wizardIconTestId } from './wizardScopeIcons'
import { Button } from '@/components/ui/button'

interface Props {
  currentStep: number
  totalSteps: number
  mode: WizardMode
  onPrev: () => void
  onNext: () => void
  onSaveDraft: () => void
  onGenerate?: () => void
  canGoNext: boolean
  generating?: boolean
  hideGenerateOnLastStep?: boolean
}

export function StickyFooter({
  currentStep,
  totalSteps,
  mode,
  onPrev,
  onNext,
  onSaveDraft,
  onGenerate,
  canGoNext,
  generating = false,
  hideGenerateOnLastStep = false,
}: Props) {
  const GenerationIcon = getWizardScopeIcon('generation')
  const GeneratingIcon = getWizardScopeIcon('generating')
  const visibleTotalSteps = mode === 'new' ? totalSteps - 1 : totalSteps
  const visibleCurrentStep = mode === 'new' && currentStep > 5 ? currentStep - 1 : currentStep
  const progressPercent = Math.round((visibleCurrentStep / visibleTotalSteps) * 100)
  const isLastStep = currentStep === totalSteps

  return (
    <footer className="sticky bottom-0 z-20 flex h-[72px] shrink-0 items-center border-t border-slate-200 bg-white px-6">
      <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between">
        <Button unstyled
          type="button"
          onClick={onPrev}
          disabled={currentStep <= 1 || generating}
          className="rounded-lg px-3 py-1.5 text-sm text-slate-600 transition-colors hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
        >
          上一步
        </Button>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 tabular-nums">
            已完成 {visibleCurrentStep}/{visibleTotalSteps} 步
          </span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button unstyled
            type="button"
            onClick={onSaveDraft}
            disabled={generating}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-600 transition-colors hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-300 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
          >
            暂存草稿
          </Button>
          {isLastStep ? (
            hideGenerateOnLastStep ? (
              <span className="text-xs text-slate-500">请在确认页生成任务</span>
            ) : (
              <Button unstyled
                type="button"
                onClick={onGenerate}
                disabled={generating}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none active:scale-[0.98]"
              >
                {generating
                  ? <GeneratingIcon className="h-4 w-4 animate-spin" data-testid={wizardIconTestId('generating')} />
                  : <GenerationIcon className="h-4 w-4" data-testid={wizardIconTestId('generation')} />}
                {generating ? '正在生成' : '生成任务'}
              </Button>
            )
          ) : (
            <Button unstyled
              type="button"
              onClick={onNext}
              disabled={!canGoNext || generating}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none active:scale-[0.98]"
            >
              下一步
            </Button>
          )}
        </div>
      </div>
    </footer>
  )
}
