import { useRef } from 'react'
import {
  CalendarCheck,
  ChevronDown,
  Download,
  FilePlus2,
  Filter,
  GitBranch,
  Layers3,
  MoreHorizontal,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface TaskListBusinessActionsProps {
  canEdit?: boolean
  baselineActionPending?: boolean
  baselineStatusKnown?: boolean
  hasBaseline?: boolean
  onOpenEngineeringObjects: () => void
  onOpenCriticalPath: () => void
  onGenerateTasks?: () => void
  onImportTasks?: (file: File) => void
  onOpenBaselineGovernance?: () => void
  onOpenExport: () => void
  onOpenFilters?: () => void
  onOpenReconcile?: () => void
  onOpenSaveCompanyTemplate?: () => void
  onScrollToToday: () => void
}

export function TaskListBusinessActions({
  canEdit = true,
  baselineActionPending = false,
  baselineStatusKnown = true,
  hasBaseline = false,
  onOpenEngineeringObjects,
  onOpenCriticalPath,
  onGenerateTasks,
  onImportTasks,
  onOpenBaselineGovernance,
  onOpenExport,
  onOpenFilters,
  onOpenReconcile,
  onOpenSaveCompanyTemplate,
  onScrollToToday,
}: TaskListBusinessActionsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      {canEdit && onOpenBaselineGovernance ? (
        <Button
          variant={baselineStatusKnown && !hasBaseline ? 'default' : 'outline'}
          size="sm"
          onClick={onOpenBaselineGovernance}
          disabled={baselineActionPending}
          aria-busy={!baselineStatusKnown || baselineActionPending ? true : undefined}
          data-testid="gantt-open-baseline-governance"
        >
          <ShieldCheck className="mr-2 h-4 w-4" />
          {hasBaseline ? '更新基线' : '计划治理'}
        </Button>
      ) : null}
      {canEdit && onImportTasks ? (
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".xlsx,.xls,.csv,.tsv,.xml,text/csv,application/xml,text/xml,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          data-testid="gantt-import-task-file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) onImportTasks(file)
          }}
        />
      ) : null}
      <Button
        variant="outline"
        size="sm"
        onClick={onOpenCriticalPath}
        data-testid="gantt-critical-path-summary-chip"
      >
        <GitBranch className="mr-2 h-4 w-4" />
        关键路径
      </Button>
      {onOpenFilters ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenFilters}
          data-testid="gantt-open-task-filters"
        >
          <Filter className="mr-2 h-4 w-4" />
          筛选
        </Button>
      ) : null}
      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              data-testid="gantt-generation-template-menu"
              data-onboarding-target="template-generate"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              生成与模板
              <ChevronDown className="ml-1 h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs text-slate-500">任务生成</DropdownMenuLabel>
            {onGenerateTasks ? (
              <DropdownMenuItem onClick={() => onGenerateTasks()} data-testid="gantt-generate-template-tasks">
              <Sparkles className="mr-2 h-4 w-4" />
              智能生成任务
              </DropdownMenuItem>
            ) : null}
            {onImportTasks ? (
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()} data-testid="gantt-import-tasks">
                <Upload className="mr-2 h-4 w-4" />
                导入计划文件
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={onOpenEngineeringObjects} data-testid="gantt-open-engineering-objects">
              <Layers3 className="mr-2 h-4 w-4" />
              工程对象
            </DropdownMenuItem>
            {(onOpenReconcile || onOpenSaveCompanyTemplate) ? <DropdownMenuSeparator /> : null}
            {onOpenReconcile ? (
              <DropdownMenuItem onClick={onOpenReconcile} data-testid="gantt-open-reconcile">
                <RefreshCw className="mr-2 h-4 w-4" />
                重新调整模板
              </DropdownMenuItem>
            ) : null}
            {onOpenSaveCompanyTemplate ? (
              <DropdownMenuItem onClick={onOpenSaveCompanyTemplate} data-testid="gantt-save-company-template">
                <FilePlus2 className="mr-2 h-4 w-4" />
                另存为公司模板
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" data-testid="gantt-task-list-light-more">
            <MoreHorizontal className="mr-2 h-4 w-4" />
            更多
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onOpenExport} data-testid="gantt-open-export-dialog">
            <Download className="mr-2 h-4 w-4" />
            导出
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onScrollToToday} data-testid="gantt-scroll-to-today">
            <CalendarCheck className="mr-2 h-4 w-4" />
            今天
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

export function TaskListEditBusinessActions(props: TaskListBusinessActionsProps) {
  return <TaskListBusinessActions {...props} />
}

export default TaskListBusinessActions
