import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ListTree } from 'lucide-react'

import { TemplateInlineExpand } from '@/components/planning/TemplateInlineExpand'
import type { PlanningTableTemplateGenerate } from '@/components/planning/PlanningCommitModel'
import type { WbsTemplateGenerateApplyContext } from '@/components/planning/WbsTemplateGenerateDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePlanningFieldRegistry } from '@/hooks/usePlanningFieldRegistry'
import { toast } from '@/hooks/use-toast'
import { getApiErrorMessage } from '@/lib/apiClient'
import { commitTaskListTable } from '@/services/planningCommitApi'
import {
  getTaskPlanDrilldownContext,
  type TaskPlanDrilldownContext,
} from '@/services/taskPlanDrilldownApi'
import type { WbsTemplateGeneratePreview } from '@/services/wbsTemplateGenerationApi'

const LEVEL_LABELS = {
  master_control: '主控计划',
  process_detail: '工序明细',
  activity_step: '作业步骤',
} as const

function taskTitle(context: TaskPlanDrilldownContext) {
  return String(context.parentTask.title ?? '未命名任务')
}

export interface TaskPlanDrilldownWorkbenchProps {
  projectId: string
  taskId: string
  onClose: () => void
  onCommitted: () => void
}

export function TaskPlanDrilldownWorkbench({
  projectId,
  taskId,
  onClose,
  onCommitted,
}: TaskPlanDrilldownWorkbenchProps) {
  const [context, setContext] = useState<TaskPlanDrilldownContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { registry, refetch } = usePlanningFieldRegistry(projectId, 'task_list')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    getTaskPlanDrilldownContext(taskId)
      .then((nextContext) => {
        if (active) setContext(nextContext)
      })
      .catch((caught) => {
        if (active) setError(getApiErrorMessage(caught, '任务下钻上下文加载失败'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [taskId])

  const handleApply = useCallback(async (
    preview: WbsTemplateGeneratePreview,
    applyContext: WbsTemplateGenerateApplyContext,
  ) => {
    if (!context?.recommendation || !context.generationDepth || !context.nextLevel) {
      throw new Error('当前任务没有可提交的下一层计划')
    }
    const registryVersion = registry?.registryVersion ?? (await refetch())?.registryVersion
    if (!registryVersion) throw new Error('任务字段注册表未加载')

    const previewRows = preview.previewRows ?? preview.rows ?? []
    const operation: PlanningTableTemplateGenerate = {
      type: 'template_generate',
      generationBatchId: preview.generationBatchId,
      templateId: applyContext.templateId,
      templateIds: applyContext.templateIds,
      selectedNodeIds: applyContext.selectedNodeIds,
      selectedNodesByTemplate: applyContext.selectedNodesByTemplate,
      scope: applyContext.scope,
      attachUnderRowId: taskId,
      sourceParentTaskId: taskId,
      drilldownMode: 'selected_children',
      drilldownGenerationLevel: context.nextLevel,
      generationDepth: context.generationDepth,
      includeActivitySteps: context.includeActivitySteps,
      duplicatePolicy: applyContext.duplicatePolicy,
      previewRows,
      rowLimitPolicy: preview.rowLimitPolicy,
      generationBatches: preview.generationBatches,
      plannedStartDate: applyContext.plannedStartDate,
      sortOrder: applyContext.sortOrder,
    }

    await commitTaskListTable({
      projectId,
      fieldRegistryVersion: registryVersion,
      operations: [operation],
      clientContext: {
        source: 'task_plan_selected_parent_drilldown',
        parentTaskId: taskId,
        rowLimit: context.rowLimit,
      },
    })
    toast({
      title: '下钻计划已保存',
      description: `已生成 ${previewRows.length} 条${LEVEL_LABELS[context.nextLevel]}。`,
    })
    onCommitted()
  }, [context, onCommitted, projectId, refetch, registry?.registryVersion, taskId])

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50" data-testid="task-plan-drilldown-workbench">
      <header className="flex min-h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <Button type="button" variant="ghost" size="icon" aria-label="返回任务计划" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-slate-900">
            {context ? taskTitle(context) : '任务下钻'}
          </h1>
          {context ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                {LEVEL_LABELS[context.currentLevel]}
              </Badge>
              {context.nextLevel ? (
                <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                  {LEVEL_LABELS[context.nextLevel]}
                </Badge>
              ) : null}
              <span className="tabular-nums">项目任务 {context.projectTaskCount}</span>
            </div>
          ) : null}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto w-full max-w-6xl">
          {loading ? (
            <div className="flex min-h-56 items-center justify-center text-sm text-slate-500">加载中</div>
          ) : error ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : !context?.nextLevel || !context.generationDepth ? (
            <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-slate-500">
              <ListTree className="h-4 w-4" />
              当前任务已是作业步骤层级
            </div>
          ) : !context.recommendation ? (
            <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              未匹配到可下钻的系统模板节点
            </div>
          ) : (
            <>
              {context.projectRowLimitExceeded ? (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  当前项目任务数已超过 {context.warningThreshold}，本次下钻仍可继续。
                </div>
              ) : null}
              <TemplateInlineExpand
                projectId={projectId}
                surface="task_list"
                defaultScope={context.scope}
                scopeLabel="工程范围已锁定"
                defaultPlannedStartDate={String(
                  context.parentTask.planned_start_date
                    ?? context.parentTask.start_date
                    ?? '',
                )}
                defaultSortOrder={Number(context.parentTask.sort_order ?? 0)}
                attachUnderRowId={taskId}
                drilldownPreset={{
                  templateId: context.recommendation.templateId,
                  templateName: context.recommendation.templateName,
                  selectedNodeIds: context.recommendation.selectedNodeIds,
                  selectedNodeNames: context.recommendation.selectedNodeNames,
                  generationDepth: context.generationDepth,
                  includeActivitySteps: context.includeActivitySteps,
                  rowLimit: context.rowLimit,
                }}
                applyLabel="生成并保存"
                onApply={handleApply}
                onCancel={onClose}
              />
            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default TaskPlanDrilldownWorkbench
