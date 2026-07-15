// v1.4.7.1 §12.3: Task list empty state dual-entry
// For projects without any tasks: [+] add first row / [⤵] generate tasks

import { memo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Plus, Sparkles, Upload } from 'lucide-react'

export interface TaskListEmptyStateProps {
  onAddFirstRow: () => void
  onGenerateTasks?: () => void
  onImportTasks?: (file: File) => void
  canEdit?: boolean
  className?: string
}

export const TaskListEmptyState = memo(function TaskListEmptyState(props: TaskListEmptyStateProps) {
  const { onAddFirstRow, onGenerateTasks, onImportTasks, canEdit = true, className } = props
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!canEdit) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-4 py-16', className)} data-testid="task-list-empty-readonly">
        <p className="text-sm text-slate-400">暂无任务数据</p>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 py-16', className)} data-testid="task-list-empty-state">
      <p className="text-sm text-slate-500">项目还没有任务，选择一个方式开始：</p>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="default"
          className="gap-2"
          onClick={onAddFirstRow}
          data-testid="task-list-add-first-row"
        >
          <Plus className="h-4 w-4" />
          进入编辑并新增首行
        </Button>
        {onImportTasks && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls,.csv,.tsv,.xml,text/csv,application/xml,text/xml,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              data-testid="task-list-empty-import-file"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (file) onImportTasks(file)
              }}
            />
            <Button
              variant="outline"
              size="default"
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
              data-testid="task-list-empty-import"
            >
              <Upload className="h-4 w-4" />
              导入计划文件
            </Button>
          </>
        )}
        {onGenerateTasks && (
          <Button
            variant="default"
            size="default"
            className="gap-2"
            onClick={() => onGenerateTasks()}
            data-testid="task-list-generate-tasks"
            data-onboarding-target="template-generate"
          >
            <Sparkles className="h-4 w-4" />
            生成任务
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-400">
        所有新增任务走统一保存逻辑，进度变化由系统自动记录
      </p>
    </div>
  )
})

export default TaskListEmptyState
