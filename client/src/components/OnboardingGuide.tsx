import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  LayoutDashboard,
  Navigation,
  Route,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useStore } from '@/hooks/useStore'
import { safeStorageGet, safeStorageSet } from '@/lib/browserStorage'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

const ONBOARDING_COMPLETED_KEY = 'onboarding_completed'
const WORKFLOW_DISMISSED_KEY = 'onboarding_daily_workflow_dismissed'

type GuideStep = {
  id: string
  title: string
  description: string
  selector: string
  side: 'right' | 'bottom' | 'left' | 'top'
  icon: typeof Navigation
}

type AnchorRect = {
  top: number
  left: number
  width: number
  height: number
}

const guideSteps: GuideStep[] = [
  {
    id: 'sidebar',
    title: '侧边栏导航结构',
    description: '项目、计划、任务、报表和提醒都从这里进入。',
    selector: '[data-onboarding-target="sidebar"]',
    side: 'right',
    icon: Navigation,
  },
  {
    id: 'dashboard',
    title: 'Dashboard 核心指标区',
    description: '项目进度、偏差、风险和今日待办先在这里扫一眼。',
    selector: '[data-onboarding-target="dashboard-metrics"], [data-onboarding-target="dashboard-nav"]',
    side: 'bottom',
    icon: LayoutDashboard,
  },
  {
    id: 'planning',
    title: '计划编制入口',
    description: '这是使用系统的第一步，先建立项目基线与月度计划。',
    selector: '[data-onboarding-target="planning-nav"]',
    side: 'right',
    icon: ClipboardList,
  },
  {
    id: 'gantt',
    title: '甘特图入口',
    description: '进入任务列表后处理进度、条件、阻碍和关键路径。',
    selector: '[data-onboarding-target="gantt-nav"]',
    side: 'right',
    icon: Route,
  },
  {
    id: 'reports',
    title: '报表分析入口',
    description: '报表用于复盘进度、偏差、风险和变更记录。',
    selector: '[data-onboarding-target="reports-nav"]',
    side: 'right',
    icon: BarChart3,
  },
]

const workflowSteps = [
  { label: 'Dashboard 查看概况', path: '/projects/:id/dashboard' },
  { label: '处理 TodayLive 待办', path: '/projects/:id/dashboard' },
  { label: '进甘特图调整任务', path: '/projects/:id/gantt' },
  { label: '查看报表', path: '/projects/:id/reports' },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getAnchorRect(selector: string): AnchorRect | null {
  if (typeof document === 'undefined') return null
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) return null
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return null
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }
}

function ProgressDots({ currentStep }: { currentStep: number }) {
  const dots = guideSteps.map((_, index) => (index <= currentStep ? '●' : '○')).join(' ')
  return (
    <div className="font-mono text-sm tracking-wider text-blue-600" aria-label={`引导进度 ${currentStep + 1}/${guideSteps.length}`}>
      {dots}
    </div>
  )
}

function DailyWorkflowCard({ onDismiss, projectId }: { onDismiss: () => void; projectId?: string | null }) {
  return (
    <div
      data-testid="onboarding-daily-workflow"
      className="fixed bottom-5 right-5 z-[60] w-[min(420px,calc(100vw-40px))] rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-[var(--el-3)] motion-safe:animate-fade-in"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
            <CheckCircle2 className="h-4 w-4 text-blue-600" />
            每日工作流
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-blue-900">
            <span className="rounded-lg bg-white/80 px-2.5 py-1 shadow-sm">每天</span>
            {workflowSteps.map((step) => (
              <span key={step.label} className="inline-flex items-center gap-2">
                <ArrowRight className="h-3.5 w-3.5 text-blue-500" />
                {projectId ? (
                  <Link
                    to={step.path.replace(':id', projectId)}
                    className="rounded-lg bg-white/80 px-2.5 py-1 shadow-sm transition-all hover:bg-white hover:shadow-md"
                  >
                    {step.label}
                  </Link>
                ) : (
                  <span className="rounded-lg bg-white/80 px-2.5 py-1 shadow-sm">{step.label}</span>
                )}
              </span>
            ))}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="关闭每日工作流"
          onClick={onDismiss}
          className="h-8 w-8 shrink-0 rounded-lg text-blue-700 hover:bg-blue-100 hover:text-blue-900"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function OnboardingGuide() {
  const { currentProject } = useStore()
  const projectId = currentProject?.id
  const [ready, setReady] = useState(false)
  const [active, setActive] = useState(false)
  const [showWorkflow, setShowWorkflow] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [anchorRect, setAnchorRect] = useState<AnchorRect | null>(null)
  const currentStep = guideSteps[stepIndex]
  const CurrentIcon = currentStep.icon

  useEffect(() => {
    const completed = safeStorageGet(window.localStorage, ONBOARDING_COMPLETED_KEY) === 'true'
    const workflowDismissed = safeStorageGet(window.localStorage, WORKFLOW_DISMISSED_KEY) === 'true'
    setActive(!completed)
    setShowWorkflow(completed && !workflowDismissed)
    setReady(true)
  }, [])

  useLayoutEffect(() => {
    if (!active) return undefined

    const updateAnchor = () => {
      setAnchorRect(getAnchorRect(currentStep.selector))
    }

    updateAnchor()
    const timer = window.setTimeout(updateAnchor, 250)
    window.addEventListener('resize', updateAnchor)
    window.addEventListener('scroll', updateAnchor, true)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', updateAnchor)
      window.removeEventListener('scroll', updateAnchor, true)
    }
  }, [active, currentStep.selector])

  const triggerStyle = useMemo(() => {
    if (!anchorRect || typeof window === 'undefined') {
      return {
        top: '5rem',
        left: '5rem',
      }
    }

    const rawTop = anchorRect.top + anchorRect.height / 2 - 16
    const rawLeft =
      currentStep.side === 'left'
        ? anchorRect.left - 44
        : currentStep.side === 'bottom' || currentStep.side === 'top'
          ? anchorRect.left + anchorRect.width / 2 - 16
          : anchorRect.left + anchorRect.width + 12

    return {
      top: `${clamp(rawTop, 72, window.innerHeight - 72)}px`,
      left: `${clamp(rawLeft, 16, window.innerWidth - 48)}px`,
    }
  }, [anchorRect, currentStep.side])

  const completeGuide = (showWelcomeToast: boolean) => {
    safeStorageSet(window.localStorage, ONBOARDING_COMPLETED_KEY, 'true')
    setActive(false)
    setShowWorkflow(true)
    if (showWelcomeToast) {
      toast({ title: '欢迎使用 WorkBuddy！' })
    }
  }

  const dismissWorkflow = () => {
    safeStorageSet(window.localStorage, WORKFLOW_DISMISSED_KEY, 'true')
    setShowWorkflow(false)
  }

  if (!ready) return null

  return (
    <>
      {active && anchorRect && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[55] rounded-xl ring-2 ring-blue-500 ring-offset-2 ring-offset-white transition-all duration-200"
          style={{
            top: anchorRect.top,
            left: anchorRect.left,
            width: anchorRect.width,
            height: anchorRect.height,
          }}
        />
      )}

      {active && (
        <Tooltip open>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`引导：${currentStep.title}`}
              className="fixed z-[70] flex h-8 w-8 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-600 shadow-[var(--el-3)]"
              style={triggerStyle}
            >
              <CurrentIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side={currentStep.side}
            align="center"
            sideOffset={12}
            className="z-[80] w-[min(340px,calc(100vw-32px))] rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-[var(--el-4)]"
          >
            <div data-testid="onboarding-guide" className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {stepIndex + 1}/{guideSteps.length}
                  </div>
                  <h2 className="mt-1 text-base font-semibold text-slate-900">{currentStep.title}</h2>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="关闭引导"
                  onClick={() => completeGuide(false)}
                  className="h-8 w-8 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{currentStep.description}</p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <ProgressDots currentStep={stepIndex} />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => completeGuide(false)}
                  className="h-auto rounded-none px-0 py-0 text-sm text-slate-500 transition-colors hover:bg-transparent hover:text-slate-600"
                >
                  跳过引导
                </Button>
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={stepIndex === 0}
                  onClick={() => setStepIndex((value) => Math.max(value - 1, 0))}
                  className={cn(stepIndex === 0 && 'opacity-40')}
                >
                  上一步
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    if (stepIndex === guideSteps.length - 1) {
                      completeGuide(true)
                      return
                    }
                    setStepIndex((value) => Math.min(value + 1, guideSteps.length - 1))
                  }}
                >
                  {stepIndex === guideSteps.length - 1 ? '完成引导' : '下一步'}
                </Button>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      )}

      {!active && showWorkflow && <DailyWorkflowCard onDismiss={dismissWorkflow} projectId={projectId} />}
    </>
  )
}

export default OnboardingGuide
