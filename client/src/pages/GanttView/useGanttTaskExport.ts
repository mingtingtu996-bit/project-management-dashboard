import { useCallback, useMemo, useState } from 'react'

import type { ExportFormat, ExportScope } from '@/components/planning/PlanningExportDialog'
import { toast } from '@/hooks/use-toast'
import { getApiErrorMessage } from '@/lib/apiClient'
import { readPlanningFieldConfigExtraColumns } from '@/lib/planningFieldConfig'
import type { EngineeringObject } from '@/services/engineeringObjectsApi'
import type { CriticalTaskNetworkSchedule } from '@/lib/criticalPath'

import type { Task } from '../GanttViewTypes'
import {
  buildEngineeringObjectLabelsById,
  buildTaskExportData,
  downloadTextFile,
  getTaskExportColumns,
  sanitizeExportFileName,
  toCsvText,
} from './taskExport'

type UseGanttTaskExportInput = {
  currentProjectName?: string | null
  engineeringObjects: EngineeringObject[]
  rows: Task[]
  criticalPathTaskIds?: Set<string>
  criticalScheduleByTaskId?: ReadonlyMap<string, CriticalTaskNetworkSchedule>
  taskFieldConfigStorageKey?: string | null
  taskFieldRegistryVersion?: string | null
}

export function useGanttTaskExport({
  currentProjectName,
  engineeringObjects,
  rows,
  criticalPathTaskIds = new Set(),
  criticalScheduleByTaskId = new Map(),
  taskFieldConfigStorageKey,
  taskFieldRegistryVersion,
}: UseGanttTaskExportInput) {
  const [exportOpen, setExportOpen] = useState(false)
  const engineeringObjectLabelsById = useMemo(
    () => buildEngineeringObjectLabelsById(engineeringObjects),
    [engineeringObjects],
  )

  const handleExportTaskList = useCallback(async (scope: ExportScope, format: ExportFormat) => {
    const visibleExtraColumns = readPlanningFieldConfigExtraColumns(
      taskFieldConfigStorageKey,
      taskFieldRegistryVersion,
    )
    const data = buildTaskExportData(
      rows,
      engineeringObjectLabelsById,
      scope,
      visibleExtraColumns,
      criticalPathTaskIds,
      criticalScheduleByTaskId,
    )
    const exportedColumnCount = getTaskExportColumns(scope, visibleExtraColumns).length
    const date = new Date().toISOString().slice(0, 10)
    const baseName = sanitizeExportFileName(`${currentProjectName || '项目'}_任务列表_${date}`)

    try {
      if (format === 'xlsx') {
        const XLSX = await import('@e965/xlsx')
        const workbook = XLSX.utils.book_new()
        const worksheet = XLSX.utils.aoa_to_sheet(data)
        XLSX.utils.book_append_sheet(workbook, worksheet, '任务列表')
        XLSX.writeFile(workbook, `${baseName}.xlsx`)
      } else {
        downloadTextFile(`${baseName}.csv`, `\uFEFF${toCsvText(data)}`, 'text/csv;charset=utf-8')
      }
      toast({
        title: '导出已生成',
        description: `已导出当前 ${rows.length} 行、${exportedColumnCount} 个字段。`,
      })
    } catch (error) {
      toast({
        title: '导出失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    }
  }, [
    currentProjectName,
    criticalPathTaskIds,
    criticalScheduleByTaskId,
    engineeringObjectLabelsById,
    rows,
    taskFieldConfigStorageKey,
    taskFieldRegistryVersion,
  ])

  return {
    engineeringObjectLabelsById,
    exportOpen,
    handleExportTaskList,
    setExportOpen,
  }
}
