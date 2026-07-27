// v1.4.7.1: Right-side drawer with 8 fixed sections for task detail
// Handles deep inspection + mid-frequency complex business actions

import { memo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  ChevronDown,
  ChevronUp,
  X,
  AlertCircle,
  ShieldCheck,
  GitBranch,
  CheckCircle2,
  MapPin,
  User,
  FileText,
  Clock,
} from 'lucide-react'

export type DrawerSection =
  | 'basic'       // 基本信息
  | 'scope'       // 工程对象
  | 'responsibility'  // 责任
  | 'conditions'  // 开工条件
  | 'blockages'   // 阻碍
  | 'predecessors' // 前置任务
  | 'acceptance'  // 影响验收
  | 'source'      // 来源

const SECTION_LABELS: Record<DrawerSection, string> = {
  basic: '基本信息',
  scope: '工程对象',
  responsibility: '责任',
  conditions: '开工条件',
  blockages: '阻碍',
  predecessors: '前置任务',
  acceptance: '影响验收',
  source: '来源',
}

const SECTION_ICONS: Record<DrawerSection, ReactNode> = {
  basic: <FileText className="h-4 w-4" />,
  scope: <MapPin className="h-4 w-4" />,
  responsibility: <User className="h-4 w-4" />,
  conditions: <ShieldCheck className="h-4 w-4" />,
  blockages: <AlertCircle className="h-4 w-4" />,
  predecessors: <GitBranch className="h-4 w-4" />,
  acceptance: <CheckCircle2 className="h-4 w-4" />,
  source: <Clock className="h-4 w-4" />,
}

const SECTIONS: DrawerSection[] = [
  'basic', 'scope', 'responsibility', 'conditions',
  'blockages', 'predecessors', 'acceptance', 'source',
]

export interface PlanningDetailDrawerProps {
  open: boolean
  onClose: () => void
  taskTitle: string
  taskSequenceLabel?: string
  taskStatusLabel?: string
  activeSection?: DrawerSection
  onSectionChange?: (section: DrawerSection) => void
  onPreviousTask?: () => void
  onNextTask?: () => void
  hasPrevious?: boolean
  hasNext?: boolean
  // Section content renderers
  renderBasicInfo?: () => ReactNode
  renderScope?: () => ReactNode
  renderResponsibility?: () => ReactNode
  renderConditions?: () => ReactNode
  renderBlockages?: () => ReactNode
  renderPredecessors?: () => ReactNode
  renderAcceptance?: () => ReactNode
  renderSource?: () => ReactNode
  className?: string
}

export const PlanningDetailDrawer = memo(function PlanningDetailDrawer(props: PlanningDetailDrawerProps) {
  const {
    open,
    onClose,
    taskTitle,
    taskSequenceLabel,
    taskStatusLabel,
    activeSection: externalSection,
    onSectionChange,
    onPreviousTask,
    onNextTask,
    hasPrevious,
    hasNext,
    renderBasicInfo,
    renderScope,
    renderResponsibility,
    renderConditions,
    renderBlockages,
    renderPredecessors,
    renderAcceptance,
    renderSource,
    className,
  } = props

  if (!open) return null

  const sectionRenderers: Record<DrawerSection, (() => ReactNode) | undefined> = {
    basic: renderBasicInfo,
    scope: renderScope,
    responsibility: renderResponsibility,
    conditions: renderConditions,
    blockages: renderBlockages,
    predecessors: renderPredecessors,
    acceptance: renderAcceptance,
    source: renderSource,
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-slate-900/20 transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        data-testid="planning-detail-drawer"
        className={cn(
          'fixed right-0 top-0 z-50 flex h-screen w-[480px] max-w-[90vw] flex-col border-l border-slate-200 bg-white shadow-[var(--el-4)]',
          'animate-[slideInRight_250ms_ease-out]',
          className,
        )}
      >
        {/* Fixed header */}
        <div className="shrink-0 border-b border-slate-100 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {taskSequenceLabel && (
                  <span className="text-xs tabular-nums text-slate-400">{taskSequenceLabel}</span>
                )}
                <h3 className="truncate text-base font-semibold text-slate-900">{taskTitle}</h3>
              </div>
              {taskStatusLabel && (
                <Badge variant="outline" className="mt-1">{taskStatusLabel}</Badge>
              )}
            </div>
            <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Section navigation */}
          <nav className="mt-3 flex items-center gap-0.5 overflow-x-auto pb-1">
            {SECTIONS.map((section) => {
              const isActive = (externalSection ?? 'basic') === section
              return (
                <Button
                  key={section}
                  type="button"
                  variant={isActive ? 'default' : 'ghost'}
                  size="sm"
                  className={cn(
                    'h-7 shrink-0 gap-1 px-2 text-xs',
                    !isActive && 'text-slate-500',
                  )}
                  onClick={() => onSectionChange?.(section)}
                >
                  {SECTION_ICONS[section]}
                  {SECTION_LABELS[section]}
                </Button>
              )
            })}
          </nav>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {SECTIONS.map((section) => {
            const isActive = (externalSection ?? 'basic') === section
            if (!isActive) return null
            const renderer = sectionRenderers[section]
            return (
              <div key={section} className="space-y-4">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  {SECTION_ICONS[section]}
                  {SECTION_LABELS[section]}
                </h4>
                <Separator />
                <div className="space-y-3">
                  {renderer ? renderer() : (
                    <p className="text-sm text-slate-400">暂无{SECTION_LABELS[section]}信息</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Fixed footer: previous/next task navigation */}
        <div className="shrink-0 border-t border-slate-100 px-5 py-3">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              disabled={!hasPrevious}
              onClick={onPreviousTask}
              className="gap-1 text-xs"
            >
              <ChevronUp className="h-3.5 w-3.5" />
              上一行
            </Button>
            <span className="text-xs text-slate-400">任务详情</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!hasNext}
              onClick={onNextTask}
              className="gap-1 text-xs"
            >
              下一行
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </>
  )
})

export default PlanningDetailDrawer
