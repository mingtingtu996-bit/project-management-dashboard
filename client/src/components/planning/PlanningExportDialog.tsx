// v1.4.7.1: Export Excel/CSV dialog (section 8.2)

import { memo, useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { FileSpreadsheet, FileText } from 'lucide-react'

export type ExportFormat = 'xlsx' | 'csv'
export type ExportScope = 'visible' | 'all'

export interface PlanningExportDialogProps {
  open: boolean
  onClose: () => void
  onExport: (scope: ExportScope, format: ExportFormat) => void
  projectName?: string
  pageName?: string
  className?: string
}

const FIELD_MAP: Record<string, { header: string; format?: string }> = {
  wbs_code: { header: 'WBS编号', format: 'text' },
  name: { header: '任务名称', format: 'text' },
  title: { header: '任务名称', format: 'text' },
  category_type: { header: '类型', format: 'text' },
  planned_start_date: { header: '计划开始', format: 'YYYY-MM-DD' },
  planned_end_date: { header: '计划完成', format: 'YYYY-MM-DD' },
  duration_days: { header: '计划工期(天)', format: 'integer' },
  progress: { header: '进度(%)', format: 'integer 0-100' },
  actual_start_date: { header: '实际开始', format: 'YYYY-MM-DD' },
  actual_end_date: { header: '实际完成', format: 'YYYY-MM-DD' },
  assignee_name: { header: '责任人', format: 'text' },
  unit_name: { header: '责任单位', format: 'text' },
  engineering_objects: { header: '工程对象', format: 'text' },
  milestone_level: { header: '里程碑', format: 'text' },
  status: { header: '状态', format: 'text' },
}

export function getExportHeaders(): string[] {
  return Object.values(FIELD_MAP).map((field) => field.header)
}

export function getExportFieldMap(): Record<string, string> {
  return Object.fromEntries(Object.entries(FIELD_MAP).map(([key, value]) => [key, value.header]))
}

export const PlanningExportDialog = memo(function PlanningExportDialog(props: PlanningExportDialogProps) {
  const { open, onClose, onExport, projectName = '', pageName = '', className } = props
  const [scope, setScope] = useState<ExportScope>('visible')
  const [format, setFormat] = useState<ExportFormat>('xlsx')

  const handleExport = useCallback(() => {
    onExport(scope, format)
    onClose()
  }, [scope, format, onExport, onClose])

  const fileName = `${projectName || '项目'}_${pageName || '计划'}_${new Date().toISOString().slice(0, 10)}.${format}`

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        className={cn('max-w-sm rounded-2xl shadow-[var(--el-4)]', className)}
        data-testid="planning-export-dialog"
      >
        <DialogHeader>
          <DialogTitle className="text-base">导出计划表</DialogTitle>
          <DialogDescription className="text-xs">
            选择导出范围和格式。导出不写入业务事实链路。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">导出范围</label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={scope === 'visible' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 text-xs"
                onClick={() => setScope('visible')}
              >
                当前可见字段
              </Button>
              <Button
                type="button"
                variant={scope === 'all' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 text-xs"
                onClick={() => setScope('all')}
              >
                全部字段
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">导出格式</label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={format === 'xlsx' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 gap-1.5 text-xs"
                onClick={() => setFormat('xlsx')}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Excel (.xlsx)
              </Button>
              <Button
                type="button"
                variant={format === 'csv' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 gap-1.5 text-xs"
                onClick={() => setFormat('csv')}
              >
                <FileText className="h-3.5 w-3.5" />
                CSV
              </Button>
            </div>
          </div>

          <p className="text-xs text-slate-400">文件名: {fileName}</p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={handleExport}>导出</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

export default PlanningExportDialog
