import type { WizardMode, WizardStep } from './types'
import { getWizardScopeIcon, wizardIconTestId } from './wizardScopeIcons'
import { Button } from '@/components/ui/button'

const STEP_LABELS: { step: WizardStep; title: string; subtitle: string; iconKey: string; hiddenOnNew?: boolean }[] = [
  { step: 1, title: '身份时间', subtitle: '项目名称、地点、目标', iconKey: 'wizard_step_identity' },
  { step: 2, title: '业态工法', subtitle: '项目类型、结构工法', iconKey: 'wizard_step_business' },
  { step: 3, title: '范围体量', subtitle: '单体、地下室、工程区域', iconKey: 'wizard_step_scope' },
  { step: 4, title: '专项约束', subtitle: '触发专项模板', iconKey: 'wizard_step_features' },
  { step: 5, title: '起跑线', subtitle: '仅已开工项目', iconKey: 'wizard_step_starting_line', hiddenOnNew: true },
  { step: 6, title: '生成确认', subtitle: '画像、工期校准、生成', iconKey: 'wizard_step_confirmation' },
]

interface Props {
  currentStep: number
  totalSteps: number
  mode: WizardMode
  onStepClick: (step: WizardStep) => void
  onToggleFreeMode: () => void
  showFreeMode: boolean
}

export function StepIndicator({ currentStep, mode, onStepClick, onToggleFreeMode, showFreeMode }: Props) {
  const visibleSteps = STEP_LABELS.filter((step) => !step.hiddenOnNew || mode === 'starting_line')
  const displayStepNumber = (step: WizardStep) => mode === 'new' && step > 5 ? step - 1 : step

  return (
    <div className="sticky top-[72px] z-20 flex h-16 shrink-0 items-center border-b border-slate-200 bg-white px-6">
      <div className="mx-auto flex w-full max-w-screen-2xl items-center gap-0">
        {visibleSteps.map((step, index) => {
          const isActive = currentStep === step.step
          const isCompleted = currentStep > step.step
          const isDisabled = currentStep < step.step
          const Icon = getWizardScopeIcon(isCompleted ? 'wizard_complete' : step.iconKey)

          return (
            <div key={step.step} className="flex flex-1 items-center last:flex-none">
              <Button unstyled
                type="button"
                onClick={() => !isDisabled && onStepClick(step.step)}
                disabled={isDisabled}
                className={`group flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none ${
                  isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    isCompleted || isActive
                      ? 'bg-blue-600 text-white'
                      : 'border-2 border-slate-300 text-slate-500'
                  }`}
                >
                  {isCompleted || isActive ? (
                    <Icon
                      className="h-3.5 w-3.5"
                      data-testid={wizardIconTestId(isCompleted ? 'wizard_complete' : step.iconKey)}
                    />
                  ) : (
                    displayStepNumber(step.step)
                  )}
                </span>
                <div className="flex flex-col">
                  <span
                    className={`text-sm ${
                      isActive ? 'font-semibold text-slate-900' : isCompleted ? 'text-slate-700' : 'text-slate-400'
                    }`}
                  >
                    {step.title}
                  </span>
                  <span className="mt-0.5 text-xs text-slate-500">{step.subtitle}</span>
                </div>
              </Button>
              {index < visibleSteps.length - 1 ? (
                <div className={`mx-3 h-px flex-1 ${isCompleted ? 'bg-blue-600' : 'bg-slate-200'}`} />
              ) : null}
            </div>
          )
        })}
        <Button unstyled
          type="button"
          onClick={onToggleFreeMode}
          className="ml-4 whitespace-nowrap rounded px-2 py-1 text-xs text-slate-500 transition-colors hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
        >
          {showFreeMode ? '收起全部' : '展开全部'}
        </Button>
      </div>
    </div>
  )
}
