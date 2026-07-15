import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  LayoutDashboard,
  Navigation,
  Route,
  Sparkles,
  X,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useStore } from '@/hooks/useStore'
import { toast } from '@/hooks/use-toast'
import { safeStorageGet, safeStorageSet } from '@/lib/browserStorage'
import { cn } from '@/lib/utils'

const WORKSPACE_ONBOARDING_COMPLETED_KEY = 'onboarding_workspace_completed'
const PROJECT_ONBOARDING_COMPLETED_KEY = 'onboarding_project_completed'
const WORKFLOW_DISMISSED_KEY = 'onboarding_daily_workflow_dismissed'

type GuideFlow = 'workspace' | 'project'

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

const workspaceSteps: GuideStep[] = [
  {
    id: 'workspace-context',
    title: '工作台上下文',
    description: '这里确认当前公司、你的身份和公司切换入口，所有用户都会先从工作台开始。',
    selector: '[data-onboarding-target="workspace-context"]',
    side: 'bottom',
    icon: BriefcaseBusiness,
  },
  {
    id: 'workspace-attention',
    title: '待处理事项',
    description: '邀请、申请和可申请项目会在工作台聚合，避免散落到项目通知里。',
    selector: '[data-onboarding-target="workspace-metrics"], [data-onboarding-target="workspace-pending"]',
    side: 'bottom',
    icon: Bell,
  },
  {
    id: 'workspace-projects',
    title: '进入项目',
    description: '从我的项目进入项目工作区；没有项目时，可以先处理邀请或申请可见项目。',
    selector: '[data-onboarding-target="workspace-projects"], [data-onboarding-target="workspace-joinable"]',
    side: 'top',
    icon: LayoutDashboard,
  },
]

// v1.4.22.1: simplified from 7→3 steps — removed starting_line auto-popup, template generation, planning, reports, notifications
const projectSteps: GuideStep[] = [
  {
    id: 'sidebar',
    title: '项目导航',
    description: '项目内的任务、风险、材料和Dashboard都从侧边栏进入。新项目先回到工作台，再从任务列表进入计划建模工作台。',
    selector: '[data-onboarding-target="sidebar"]',
    side: 'right',
    icon: Navigation,
  },
  {
    id: 'gantt',
    title: '任务列表',
    description: '向导生成后进入任务列表复核和微调。支持搜索、筛选、折叠展开和按WBS/空间分组查看。',
    selector: '[data-onboarding-target="gantt-nav"]',
    side: 'right',
    icon: Route,
  },
  {
    id: 'dashboard',
    title: 'Dashboard 指标区',
    description: '跟踪项目健康度、进度偏差、风险趋势和今日关注事项。',
    selector: '[data-onboarding-target="dashboard-metrics"], [data-onboarding-target="dashboard-nav"]',
    side: 'bottom',
    icon: LayoutDashboard,
  },
]

const workflowSteps = [
  { label: '进入任务列表', path: '/projects/:id/gantt' },
  { label: '导入或编辑计划', path: '/projects/:id/gantt' },
  { label: '开启计划治理', path: '/projects/:id/gantt' },
  { label: 'Dashboard 查看概况', path: '/projects/:id/dashboard' },
  { label: '处理条件和阻碍', path: '/projects/:id/gantt' },
  { label: '查看提醒中心', path: '/projects/:id/notifications' },
  { label: '复盘报表', path: '/projects/:id/reports' },
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

function getCompletedKey(flow: GuideFlow) {
  return flow === 'workspace' ? WORKSPACE_ONBOARDING_COMPLETED_KEY : PROJECT_ONBOARDING_COMPLETED_KEY
}

function getGuideFlow(pathname: string): GuideFlow | null {
  if (pathname === '/workspace') return 'workspace'
  if (pathname.startsWith('/projects/')) return 'project'
  return null
}

function ProgressDots({ currentStep, total }: { currentStep: number; total: number }) {
  const dots = Array.from({ length: total }, (_, index) => (index <= currentStep ? '●' : '○')).join(' ')
  return (
    <div className="font-mono text-sm tracking-wider text-blue-600" aria-label={`引导进度 ${currentStep + 1}/${total}`}>
      {dots}
    </div>
  )
}

function DailyWorkflowCard({ onDismiss, projectId }: { onDismiss: () => void; projectId?: string | null }) {
  return (
    <div
      data-testid="onboarding-daily-workflow"
      className="fixed bottom-5 right-5 z-[60] w-[min(28rem,calc(100vw-2.5rem))] rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-[var(--el-3)] motion-safe:animate-fade-in"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
            <CheckCircle2 className="h-4 w-4 text-blue-600" />
            每日工作流
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-blue-900">
            <span className="rounded-lg bg-white/80 px-2.5 py-1 shadow-[var(--el-1)]">每天</span>
            {workflowSteps.map((step) => (
              <span key={step.label} className="inline-flex items-center gap-2">
                <ArrowRight className="h-3.5 w-3.5 text-blue-500" />
                {projectId ? (
                  <Link
                    to={step.path.replace(':id', projectId)}
                    className="rounded-lg bg-white/80 px-2.5 py-1 shadow-[var(--el-1)] transition-all hover:bg-white hover:shadow-[var(--el-2)]"
                  >
                    {step.label}
                  </Link>
                ) : (
                  <span className="rounded-lg bg-white/80 px-2.5 py-1 shadow-[var(--el-1)]">{step.label}</span>
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
  const location = useLocation()
  const { currentProject } = useStore()
  const projectId = currentProject?.id
  const flow = getGuideFlow(location.pathname)
  const guideSteps = flow === 'workspace' ? workspaceSteps : projectSteps
  const [ready, setReady] = useState(false)
  const [active, setActive] = useState(false)
  const [showWorkflow, setShowWorkflow] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [anchorRect, setAnchorRect] = useState<AnchorRect | null>(null)
  const currentStep = guideSteps[stepIndex] ?? guideSteps[0]
  const CurrentIcon = currentStep?.icon ?? Navigation

  useEffect(() => {
    setStepIndex(0)
    setAnchorRect(null)
    if (!flow) {
      setActive(false)
      setShowWorkflow(false)
      setReady(true)
      return
    }

    const completed = safeStorageGet(window.localStorage, getCompletedKey(flow)) === 'true'
    const workflowDismissed = safeStorageGet(window.localStorage, WORKFLOW_DISMISSED_KEY) === 'true'
    setActive(!completed)
    setShowWorkflow(flow === 'project' && completed && !workflowDismissed)
    setReady(true)
  }, [flow])

  useLayoutEffect(() => {
    if (!active || !currentStep) return undefined

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
  }, [active, currentStep])

  const triggerStyle = useMemo(() => {
    if (!anchorRect || typeof window === 'undefined' || !currentStep) {
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
  }, [anchorRect, currentStep])

  const completeGuide = (showWelcomeToast: boolean) => {
    if (!flow) return
    safeStorageSet(window.localStorage, getCompletedKey(flow), 'true')
    setActive(false)
    setShowWorkflow(flow === 'project')
    if (showWelcomeToast) {
      toast({ title: flow === 'workspace' ? '工作台引导已完成' : '欢迎使用 WorkBuddy' })
    }
  }

  const dismissWorkflow = () => {
    safeStorageSet(window.localStorage, WORKFLOW_DISMISSED_KEY, 'true')
    setShowWorkflow(false)
  }

  if (!ready || !flow || !currentStep) return null

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
              className="pointer-events-none fixed z-[70] flex h-8 w-8 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-600 shadow-[var(--el-3)]"
              style={triggerStyle}
            >
              <CurrentIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent
            data-onboarding-guide-content="true"
            side={currentStep.side}
            align="center"
            sideOffset={12}
            className="workbuddy-onboarding-panel pointer-events-none z-[80] w-[min(21.25rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-[var(--el-4)]"
          >
            <div data-testid="onboarding-guide" className="pointer-events-none p-4">
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
                  className="pointer-events-auto h-8 w-8 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{currentStep.description}</p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <ProgressDots currentStep={stepIndex} total={guideSteps.length} />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => completeGuide(false)}
                  className="pointer-events-auto h-auto rounded-none px-0 py-0 text-sm text-slate-500 transition-colors hover:bg-transparent hover:text-slate-600"
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
                  className={cn('pointer-events-auto', stepIndex === 0 && 'opacity-40')}
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
                  className="pointer-events-auto"
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
