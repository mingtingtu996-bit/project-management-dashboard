import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getWizardScopeIcon, wizardIconTestId } from './wizardScopeIcons'
import { Button } from '@/components/ui/button'

const ONBOARDING_COMPLETED_KEY = 'wizard_onboarding_completed'

const TOUR_STEPS = [
  {
    title: '第一次见到向导？',
    body: '先选择新项目、已开工或复用模板，向导会把项目信息转成可维护的任务列表。',
  },
  {
    title: '补齐工程对象',
    body: '楼栋、楼层、区域会作为后续任务挂载和空间分组的基础，先粗后细也可以。',
  },
  {
    title: '确认业态与工法',
    body: '业态、工法和工程特征会共同决定推荐任务包，不需要手动从模板库找入口。',
  },
  {
    title: '生成并继续治理',
    body: '生成后进入任务列表，后续可编辑、导入、另存为公司模板，也可重新调整模板。',
  },
] as const

function hasCompletedTour(user: ReturnType<typeof useAuth>['user']): boolean {
  const onboardedAt = (user as { metadata?: { wizard_onboarded_at?: unknown } } | null)?.metadata?.wizard_onboarded_at
  if (onboardedAt) return true
  try {
    return window.localStorage.getItem(ONBOARDING_COMPLETED_KEY) === 'true'
  } catch {
    return false
  }
}

function markTourCompleted() {
  try {
    window.localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true')
  } catch {
    // localStorage may be unavailable in private contexts.
  }
}

export function WizardOnboardingTour() {
  const { user } = useAuth()
  const [show, setShow] = useState(false)
  const [step, setStep] = useState(0)
  const HelpIcon = getWizardScopeIcon('wizard_help')

  useEffect(() => {
    if (!user) return
    if (!hasCompletedTour(user)) {
      setShow(true)
    }
  }, [user])

  const closeAndComplete = () => {
    markTourCompleted()
    setShow(false)
    setStep(0)
  }

  if (!show) {
    return (
      <Button unstyled
        onClick={() => {
          setStep(0)
          setShow(true)
        }}
        className="fixed top-4 right-4 z-50 text-slate-400 hover:text-slate-600 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none rounded-lg p-1"
        aria-label="重开向导帮助"
      >
        <HelpIcon className="h-5 w-5" data-testid={wizardIconTestId('wizard_help')} />
      </Button>
    )
  }

  return (
    <div data-testid="wizard-onboarding-tour" className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-[var(--el-3)] p-8 max-w-md text-center space-y-4">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <HelpIcon className="h-5 w-5" data-testid={wizardIconTestId('wizard_help')} />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
            第 {step + 1} / {TOUR_STEPS.length} 步
          </p>
          <h2 className="text-lg font-semibold text-slate-900">{TOUR_STEPS[step].title}</h2>
          <p className="text-sm leading-6 text-slate-600">{TOUR_STEPS[step].body}</p>
        </div>
        <div className="flex justify-center gap-1">
          {TOUR_STEPS.map((item, index) => (
            <span
              key={item.title}
              className={`h-1.5 w-8 rounded-full ${index === step ? 'bg-blue-600' : 'bg-slate-200'}`}
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 pt-2">
          <Button unstyled
            type="button"
            onClick={closeAndComplete}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
          >
            跳过
          </Button>
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <Button unstyled
                type="button"
                onClick={() => setStep((value) => Math.max(0, value - 1))}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
              >
                上一步
              </Button>
            ) : null}
            {step < TOUR_STEPS.length - 1 ? (
              <Button unstyled
                type="button"
                onClick={() => setStep((value) => Math.min(TOUR_STEPS.length - 1, value + 1))}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none active:scale-[0.98]"
              >
                {step === 0 ? '开始' : '下一步'}
              </Button>
            ) : (
              <Button unstyled
                type="button"
                onClick={closeAndComplete}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none active:scale-[0.98]"
              >
                完成
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
