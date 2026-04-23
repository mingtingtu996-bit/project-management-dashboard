import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { BookOpen, Layers3, ArrowRight } from 'lucide-react'

export interface OnboardingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLearnMore?: () => void
  projectName?: string
}

const LAYERS = [
  {
    title: '项目基线',
    description: '先定下来的主计划骨架，后续确认和对比都围绕它。',
  },
  {
    title: '月度计划',
    description: '把本月真正要推进的事情说清楚。',
  },
  {
    title: '当前项目计划时间',
    description: '系统整理后的最新计划时间。',
  },
  {
    title: '项目实际执行时间',
    description: '现场真实发生的时间，用来复盘和看偏差。',
  },
]

export default function OnboardingDialog({
  open,
  onOpenChange,
  onLearnMore,
  projectName,
}: OnboardingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Layers3 className="h-3.5 w-3.5" />
              首次引导
            </Badge>
          </div>
          <DialogTitle className="text-left text-xl">先用白话看懂这四层时间线</DialogTitle>
          <DialogDescription className="text-left">
            {projectName
              ? `我们会先帮「${projectName}」把 WBS 模板、基线和启用流程整理成同一套说法。`
              : '我们会把 WBS 模板、基线和启用流程整理成同一套说法。'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          {LAYERS.map((layer) => (
            <div key={layer.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 text-sm font-semibold text-slate-900">{layer.title}</div>
              <div className="text-sm leading-6 text-slate-600">{layer.description}</div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          现在进入计划编制后，系统会优先帮你把现有工作整理成可确认的骨架，再逐步进入月度计划和后续确认。
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => {
              onLearnMore?.()
              onOpenChange(true)
            }}
          >
            <BookOpen className="h-4 w-4" />
            了解更多
          </Button>
          <Button type="button" className="gap-2" onClick={() => onOpenChange(false)}>
            我知道了
            <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
