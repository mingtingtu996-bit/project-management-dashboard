import { Sparkles } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type {
  WbsGeneratedTemplateRow,
  WbsTemplateGeneratePreview,
  WbsTemplateGenerationScope,
} from '@/services/wbsTemplateGenerationApi'
import { TemplateInlineExpand } from './TemplateInlineExpand'

type TemplateSurface = 'baseline' | 'task_list'

export interface WbsTemplateGenerateApplyContext {
  templateId: string
  templateIds?: string[]
  templateName: string
  selectedNodeIds: string[]
  selectedNodesByTemplate?: Record<string, string[]>
  scope: WbsTemplateGenerationScope
  plannedStartDate: string
  generationDepth: 'item_work' | 'process' | 'activity_step'
  includeActivitySteps: boolean
  duplicatePolicy: 'skip' | 'overwrite' | 'duplicate'
  attachUnderRowId?: string | null
  sortOrder?: number
}

interface WbsTemplateGenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  surface: TemplateSurface
  defaultScope?: WbsTemplateGenerationScope
  scopeLabel?: string
  defaultPlannedStartDate?: string | null
  defaultSortOrder?: number
  attachUnderRowId?: string | null
  onApply: (preview: WbsTemplateGeneratePreview, context: WbsTemplateGenerateApplyContext) => void
}

export function WbsTemplateGenerateDialog({
  open,
  onOpenChange,
  projectId,
  surface,
  defaultScope,
  scopeLabel,
  defaultPlannedStartDate,
  defaultSortOrder = 0,
  attachUnderRowId = null,
  onApply,
}: WbsTemplateGenerateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1040px] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-100 px-6 py-5 pr-14">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl">从标准模板生成</DialogTitle>
              <DialogDescription className="sr-only">
                选择标准工序模板，生成到当前计划树编辑草稿。
              </DialogDescription>
              <p className="mt-1 text-sm text-slate-500">
                项目新建与智能生成已统一到任务列表内的计划建模工作台；这里仅用于运行中项目的单次模板补充。
              </p>
            </div>
          </div>
        </DialogHeader>
        <div className="px-6 py-5">
          <TemplateInlineExpand
            projectId={projectId}
            surface={surface}
            defaultScope={defaultScope}
            scopeLabel={scopeLabel}
            defaultPlannedStartDate={defaultPlannedStartDate}
            defaultSortOrder={defaultSortOrder}
            attachUnderRowId={attachUnderRowId}
            onApply={onApply}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export interface WbsTemplateGenerateInlinePanelProps {
  projectId: string
  surface: TemplateSurface
  defaultScope?: WbsTemplateGenerationScope
  scopeLabel?: string
  defaultPlannedStartDate?: string | null
  defaultSortOrder?: number
  attachUnderRowId?: string | null
  onApply: (preview: WbsTemplateGeneratePreview, context: WbsTemplateGenerateApplyContext) => void
  onCancel: () => void
}

export function WbsTemplateGenerateInlinePanel(props: WbsTemplateGenerateInlinePanelProps) {
  return <TemplateInlineExpand {...props} />
}

export type { WbsGeneratedTemplateRow }

export default WbsTemplateGenerateDialog
