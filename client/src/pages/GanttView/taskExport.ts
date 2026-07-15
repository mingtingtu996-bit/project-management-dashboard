import type { ExportScope } from '@/components/planning/PlanningExportDialog'
import { inclusiveDurationDays } from '@/lib/durationDays'
import type { PlanningFieldConfigExtraColumnKey } from '@/lib/planningFieldConfig'
import { neutralizeSpreadsheetFormulaText } from '@/lib/spreadsheetSecurity'
import { getWbsNodeTypeLabel } from '@/lib/wbsLabels'
import type { EngineeringObject } from '@/services/engineeringObjectsApi'
import type { Task } from '../GanttViewTypes'
import { getTaskWbsNodeType } from '../GanttViewTypes'
import {
  getTaskDurationAssetEvidenceLabel,
  getTaskDurationRiskRangeLabel,
  readRoundedFiniteNumber,
} from './taskScheduleEvidence'

type TaskExportColumn = {
  key: string
  header: string
  visibleByDefault?: boolean
  getValue: (
    task: Task,
    engineeringObjectLabelsById: Record<string, string>,
    criticalPathTaskIds: Set<string>,
  ) => string | number | boolean | null | undefined
}

function getTaskDisplayTitle(task?: Task | null) {
  return task?.title || '未命名任务'
}

function getTaskEngineeringObjectIds(task?: Task | null) {
  if (!task) return []
  return [
    task.phase_object_id,
    task.section_object_id,
    task.building_object_id,
    task.basement_object_id,
    task.floor_object_id,
    task.physical_zone_object_id,
    task.functional_area_object_id,
    task.engineering_object_id,
  ].map((value) => String(value ?? '').trim()).filter(Boolean)
}

function formatTaskExportValue(value?: string | number | boolean | null) {
  if (value === true) return '?'
  if (value === false || value == null) return ''
  return neutralizeSpreadsheetFormulaText(String(value).trim())
}

function getTaskExportDurationDays(task: Task) {
  const start = task.start_date ?? task.planned_start_date
  const end = task.end_date ?? task.planned_end_date
  return inclusiveDurationDays(start, end) ?? ''
}

const TASK_EXPORT_COLUMNS: TaskExportColumn[] = [
  { key: 'sequence', header: '序号', visibleByDefault: true, getValue: (task) => task.wbs_code },
  { key: 'title', header: '任务名称', visibleByDefault: true, getValue: (task) => getTaskDisplayTitle(task) },
  { key: 'plannedStart', header: '计划开始', visibleByDefault: true, getValue: (task) => task.start_date ?? task.planned_start_date },
  { key: 'plannedEnd', header: '计划完成', visibleByDefault: true, getValue: (task) => task.end_date ?? task.planned_end_date },
  { key: 'progress', header: '进度', visibleByDefault: true, getValue: (task) => (task.progress == null ? '' : `${Math.round(Number(task.progress ?? 0))}%`) },
  { key: 'status', header: '状态', visibleByDefault: true, getValue: (task) => task.statusLabel || task.displayStatus || task.status },
  { key: 'assignee', header: '责任人', visibleByDefault: true, getValue: (task) => task.assignee_name || task.assignee },
  { key: 'unit', header: '责任单位', visibleByDefault: true, getValue: (task) => task.participant_unit_name },
  { key: 'critical', header: '关键路径', getValue: (task, _labels, criticalPathTaskIds) => criticalPathTaskIds.has(task.id) },
  {
    key: 'engineeringObjects',
    header: '工程对象',
    getValue: (task, engineeringObjectLabelsById) => getTaskEngineeringObjectIds(task)
      .map((objectId) => engineeringObjectLabelsById[objectId] || objectId)
      .join(' / '),
  },
  { key: 'milestone', header: '里程碑', getValue: (task) => (task.is_milestone ? `L${task.milestone_level ?? 3}` : '') },
  { key: 'nodeType', header: '节点类型', getValue: (task) => getWbsNodeTypeLabel(getTaskWbsNodeType(task), task.is_executable === false ? '结构层级' : '施工任务') },
  { key: 'duration', header: '计划工期(天)', getValue: (task) => getTaskExportDurationDays(task) },
  { key: 'durationRiskRange', header: '工期风险', getValue: (task) => getTaskDurationRiskRangeLabel(task) },
  { key: 'totalFloat', header: '总浮时(天)', getValue: (task) => readRoundedFiniteNumber(task.total_float_days) },
  { key: 'freeFloat', header: '自由浮时(天)', getValue: (task) => readRoundedFiniteNumber(task.free_float_days) },
  { key: 'durationAssetEvidence', header: '工期资产依据', getValue: (task) => getTaskDurationAssetEvidenceLabel(task) },
  { key: 'template', header: '标准工项', getValue: (task) => task.standard_work_name || task.standard_work_code },
  { key: 'specialty', header: '专业', getValue: (task) => task.specialty_type },
  { key: 'description', header: '备注', getValue: (task) => task.description },
]

const TASK_VISIBLE_EXPORT_KEYS = new Set(
  TASK_EXPORT_COLUMNS.filter((column) => column.visibleByDefault).map((column) => column.key),
)

const TASK_EXPORT_KEY_BY_EXTRA_COLUMN: Partial<Record<PlanningFieldConfigExtraColumnKey, string | string[]>> = {
  type: 'nodeType',
  critical: 'critical',
  duration_risk: 'durationRiskRange',
  float: ['totalFloat', 'freeFloat'],
  duration_asset_evidence: 'durationAssetEvidence',
  notes: 'description',
}

export function getTaskExportColumns(scope: ExportScope, extraColumns: PlanningFieldConfigExtraColumnKey[] = []) {
  if (scope !== 'visible') return TASK_EXPORT_COLUMNS

  const visibleKeys = new Set(TASK_VISIBLE_EXPORT_KEYS)
  extraColumns.forEach((columnKey) => {
    const exportKey = TASK_EXPORT_KEY_BY_EXTRA_COLUMN[columnKey]
    if (Array.isArray(exportKey)) {
      exportKey.forEach((key) => visibleKeys.add(key))
      return
    }
    if (exportKey) visibleKeys.add(exportKey)
  })
  return TASK_EXPORT_COLUMNS.filter((column) => visibleKeys.has(column.key))
}

export function buildTaskExportData(
  rows: Task[],
  engineeringObjectLabelsById: Record<string, string>,
  scope: ExportScope,
  extraColumns: PlanningFieldConfigExtraColumnKey[] = [],
  criticalPathTaskIds: Set<string> = new Set(),
) {
  const columns = getTaskExportColumns(scope, extraColumns)
  return [
    columns.map((column) => column.header),
    ...rows.map((task) => columns.map((column) => formatTaskExportValue(column.getValue(task, engineeringObjectLabelsById, criticalPathTaskIds)))),
  ]
}

export function sanitizeExportFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80) || '任务列表'
}

export function toCsvText(rows: string[][]) {
  return rows
    .map((row) => row.map((cell) => {
      const value = neutralizeSpreadsheetFormulaText(String(cell ?? ''))
      return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
    }).join(','))
    .join('\r\n')
}

export function downloadTextFile(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export function buildEngineeringObjectLabelsById(objects: EngineeringObject[]) {
  return Object.fromEntries(objects.map((object) => [object.id, object.path || object.objectName || object.objectCode || object.id]))
}
