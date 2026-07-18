import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, FileClock, FileDiff, GitBranch, ListTree, Milestone, RefreshCw, Sparkles } from 'lucide-react'
import { useParams } from 'react-router-dom'

import { PlanningPageShell } from '@/components/planning/PlanningPageShell'
import { PlanningExportDialog, type ExportFormat, type ExportScope } from '@/components/planning/PlanningExportDialog'
import {
  WbsTemplateGenerateDialog,
  WbsTemplateGenerateInlinePanel,
  type WbsTemplateGenerateApplyContext,
} from '@/components/planning/WbsTemplateGenerateDialog'
import { PlanningValidationStrip } from '@/components/planning/PlanningValidationStrip'
import {
  type PlanningTreeCellKey,
  type PlanningTreeCellUpdate,
  type PlanningTreeClipboardRow,
  type PlanningTreeRow,
} from '@/components/planning/PlanningTreeView'
import { PlanningPageLayout } from '@/components/planning/PlanningPageLayout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MetricCard } from '@/components/ui/metric-card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { usePlanningPresence, type PlanningPresenceCell } from '@/hooks/usePlanningPresence'
import { usePlanningFieldRegistry } from '@/hooks/usePlanningFieldRegistry'
import { usePlanningValidation, type ValidationIssue, type ValidationInput } from '@/hooks/usePlanningValidation'
import { usePlanningViewMode } from '@/hooks/usePlanningViewMode'
import { useStore } from '@/hooks/useStore'
import { apiGet, apiPost, getApiErrorMessage } from '@/lib/apiClient'
import { inclusiveDurationDays } from '@/lib/durationDays'
import { buildPlanningConflictFieldGroups, mergePlanningItemsBeforeSave } from '@/lib/planningConflictMerge'
import { writePlanningTableExport, type PlanningExportCell } from '@/lib/planningExport'
import {
  getPlanningFieldConfigStorageKey,
  readPlanningFieldConfigExtraColumns,
  type PlanningFieldConfigExtraColumnKey,
} from '@/lib/planningFieldConfig'
import { commitPlanningTable } from '@/services/planningCommitApi'
import type { PlanningTableOperation } from '@/components/planning/PlanningCommitModel'
import type { WbsTemplateGeneratePreview } from '@/services/wbsTemplateGenerationApi'
import { cn } from '@/lib/utils'
import type { BaselineItem, BaselineVersion } from '@/types/planning'
import { BaselineVersionBar } from '@/components/planning/BaselineVersionBar'
import { BaselineDiffDrawer, BaselineDiffView, type BaselineDiffItem } from '@/components/planning/baseline'

import { PlanTreeEditor as BaselineTreeEditor } from './components/PlanTreeEditor'

type BaselineDetail = BaselineVersion & {
  items: BaselineItem[]
}

type BaselinePublishCauseCode =
  | 'predecessor_delay'
  | 'material_shortage'
  | 'labor_shortage'
  | 'equipment_unavailable'
  | 'design_change'
  | 'drawing_delay'
  | 'quality_rework'
  | 'weather_impact'
  | 'owner_decision'
  | 'government_inspection'
  | 'site_capacity_pressure'
  | 'workflow_sequence'
  | 'external_readiness'
  | 'other'

const BASELINE_PUBLISH_CAUSE_OPTIONS: Array<{ value: BaselinePublishCauseCode; label: string }> = [
  { value: 'predecessor_delay', label: '前置工作传导' },
  { value: 'material_shortage', label: '材料短缺或晚到' },
  { value: 'labor_shortage', label: '劳动力不足' },
  { value: 'equipment_unavailable', label: '设备机械不可用' },
  { value: 'design_change', label: '设计变更' },
  { value: 'drawing_delay', label: '图纸或审批延误' },
  { value: 'quality_rework', label: '质量返工' },
  { value: 'weather_impact', label: '天气影响' },
  { value: 'owner_decision', label: '业主决策等待' },
  { value: 'government_inspection', label: '政府检查审批' },
  { value: 'site_capacity_pressure', label: '现场承载不足' },
  { value: 'workflow_sequence', label: '工序顺序调整' },
  { value: 'external_readiness', label: '外部条件未就绪' },
  { value: 'other', label: '其他' },
]

export function inferBaselinePublishCauseCode(baseline: BaselineVersion | null): BaselinePublishCauseCode {
  const token = [
    baseline?.description,
    baseline?.source_type,
    baseline?.source_version_label,
    JSON.stringify(baseline?.governance_metadata ?? {}),
  ].map((value) => String(value ?? '').trim()).join(' ').toLowerCase()

  if (/(material.shortage|late.material|材料短缺|材料晚到|到货延误|供应中断)/.test(token)) return 'material_shortage'
  if (/(labor.shortage|workforce.shortage|劳动力不足|人员短缺|班组不足)/.test(token)) return 'labor_shortage'
  if (/(equipment.unavailable|machine.breakdown|设备不可用|机械故障|设备故障)/.test(token)) return 'equipment_unavailable'
  if (/(drawing.delay|approval.delay|图纸延误|出图延误|审图延误|审批延误)/.test(token)) return 'drawing_delay'
  if (/(design.change|设计变更)/.test(token)) return 'design_change'
  if (/(quality.rework|质量返工|返工整改)/.test(token)) return 'quality_rework'
  if (/(weather.impact|天气影响|极端天气)/.test(token)) return 'weather_impact'
  if (/(owner.decision|client.decision|业主决策|发包人决策)/.test(token)) return 'owner_decision'
  if (/(government.inspection|government.approval|政府检查|政府审批)/.test(token)) return 'government_inspection'
  if (/(site.capacity|现场承载不足|作业面冲突)/.test(token)) return 'site_capacity_pressure'
  if (/(predecessor.delay|dependency.delay|前置延误|依赖延误)/.test(token)) return 'predecessor_delay'
  if (/(external.readiness|外部条件未就绪|开工条件未满足)/.test(token)) return 'external_readiness'
  return 'workflow_sequence'
}

type TemplateGeneratedBaselineItem = BaselineItem & {
  __templateGenerateOperation?: PlanningTableOperation
  __templateGenerateRowValues?: Record<string, unknown>
}

type BaselineDiffResponse = {
  baselineId: string
  compareToBaselineId: string
  fromVersionLabel: string
  toVersionLabel: string
  items: BaselineDiffItem[]
}

type BaselineGenerationCandidateReason = {
  code: string
  label: string
  detail: string
  severity: 'info' | 'warning'
}

type BaselineGenerationCandidate = {
  baselineId: string
  projectId: string
  sourceVersionLabel: string
  candidateVersionLabel: string
  recommended: boolean
  summary: string
  reasons: BaselineGenerationCandidateReason[]
  metrics: {
    baselineTaskCount: number
    candidateTaskCount: number
    affectedTaskCount: number
    affectedTaskRatio: number
    addedItemCount: number
    removedItemCount: number
    changedItemCount: number
    structureChangeRatio: number
    milestoneMaxShiftDays: number
    totalFinishShiftDays: number
  }
  diffCounts: Record<string, number>
  diffItems: BaselineDiffItem[]
}

type BaselineEditorSnapshot = {
  items: BaselineItem[]
  selectedIds: string[]
}

type BaselineRow = BaselineItem & {
  depth: number
  wbsLabel: string
}

type EditableBaselineField = 'title' | 'planned_start_date' | 'planned_end_date'

type BaselineExportColumn = {
  key: string
  header: string
  visibleByDefault?: boolean
  getValue: (row: BaselineRow) => PlanningExportCell
}

const BASELINE_HISTORY_LIMIT = 50

const BASELINE_EXPORT_COLUMNS: BaselineExportColumn[] = [
  { key: 'sequence', header: '序号', visibleByDefault: true, getValue: (row) => row.wbsLabel },
  { key: 'title', header: '任务名称', visibleByDefault: true, getValue: (row) => row.title },
  { key: 'plannedStart', header: '计划开始', visibleByDefault: true, getValue: (row) => row.planned_start_date },
  { key: 'plannedEnd', header: '计划完成', visibleByDefault: true, getValue: (row) => row.planned_end_date },
  { key: 'duration', header: '计划工期', visibleByDefault: true, getValue: (row) => getDurationDays(row.planned_start_date, row.planned_end_date) },
  { key: 'targetProgress', header: '目标进度', visibleByDefault: true, getValue: (row) => (row.target_progress == null ? '' : `${row.target_progress}%`) },
  { key: 'milestone', header: '里程碑', visibleByDefault: true, getValue: (row) => Boolean(row.is_milestone) },
  { key: 'critical', header: '关键路径', getValue: (row) => Boolean(row.is_critical ?? row.is_baseline_critical) },
  { key: 'mappingStatus', header: '计划依据状态', getValue: (row) => row.mapping_status },
  { key: 'wbsNodeType', header: '节点类型', getValue: (row) => row.wbs_node_type ?? row.engineering_category_type },
  { key: 'standardWork', header: '标准工序', getValue: (row) => row.standard_work_name ?? row.standard_work_code },
  { key: 'sourceTaskId', header: '来源任务', getValue: (row) => row.source_task_id ?? row.source_milestone_id },
  { key: 'notes', header: '备注', getValue: (row) => row.notes },
]
const BASELINE_VISIBLE_EXPORT_KEYS = new Set(
  BASELINE_EXPORT_COLUMNS.filter((column) => column.visibleByDefault).map((column) => column.key),
)
const BASELINE_EXPORT_KEY_BY_EXTRA_COLUMN: Partial<Record<PlanningFieldConfigExtraColumnKey, string>> = {
  progress: 'targetProgress',
  type: 'wbsNodeType',
  critical: 'critical',
  notes: 'notes',
}

function toDateOnly(value?: string | null, fallback = '-') {
  if (!value) return fallback
  const trimmed = String(value).trim()
  if (!trimmed) return fallback
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return fallback
  return parsed.toISOString().slice(0, 10)
}

function toDateInputValue(value?: string | null) {
  const normalized = toDateOnly(value, '')
  return normalized === '-' ? '' : normalized
}

function getDurationDays(start?: string | null, end?: string | null) {
  const duration = inclusiveDurationDays(toDateInputValue(start), toDateInputValue(end))
  return duration == null ? '-' : `${duration}天`
}

function getBaselineExportColumns(scope: ExportScope, extraColumns: PlanningFieldConfigExtraColumnKey[] = []) {
  if (scope !== 'visible') return BASELINE_EXPORT_COLUMNS

  const visibleKeys = new Set(BASELINE_VISIBLE_EXPORT_KEYS)
  extraColumns.forEach((columnKey) => {
    const exportKey = BASELINE_EXPORT_KEY_BY_EXTRA_COLUMN[columnKey]
    if (exportKey) visibleKeys.add(exportKey)
  })
  return BASELINE_EXPORT_COLUMNS.filter((column) => visibleKeys.has(column.key))
}

function buildBaselineExportData(
  rows: BaselineRow[],
  scope: ExportScope,
  extraColumns: PlanningFieldConfigExtraColumnKey[] = [],
) {
  const columns = getBaselineExportColumns(scope, extraColumns)
  return [
    columns.map((column) => column.header),
    ...rows.map((row) => columns.map((column) => column.getValue(row))),
  ]
}

function getVersionLabel(version?: BaselineVersion | null) {
  if (!version) return '未建立'
  if (version.business_version_label) return version.business_version_label
  if (typeof version.version === 'number') return `v${version.version}`
  return '待发布新版'
}

function sortBaselineItems(items: BaselineItem[]) {
  return [...items].sort((left, right) => {
    const orderDiff = (left.sort_order ?? 0) - (right.sort_order ?? 0)
    if (orderDiff !== 0) return orderDiff
    return left.title.localeCompare(right.title, 'zh-CN')
  })
}

function buildBaselineRows(items: BaselineItem[]): BaselineRow[] {
  const sortedItems = sortBaselineItems(items)
  const existingIds = new Set(sortedItems.map((item) => item.id))
  const childrenByParent = new Map<string | null, BaselineItem[]>()

  for (const item of sortedItems) {
    const parentId = item.parent_item_id && existingIds.has(item.parent_item_id) ? item.parent_item_id : null
    const siblings = childrenByParent.get(parentId) ?? []
    siblings.push(item)
    childrenByParent.set(parentId, siblings)
  }

  const rows: BaselineRow[] = []
  const visited = new Set<string>()

  function visit(parentId: string | null, prefix: string, depth: number) {
    const children = sortBaselineItems(childrenByParent.get(parentId) ?? [])
    children.forEach((item, index) => {
      if (visited.has(item.id)) return
      visited.add(item.id)
      const wbsLabel = prefix ? `${prefix}.${index + 1}` : `${index + 1}`
      rows.push({ ...item, depth, wbsLabel })
      visit(item.id, wbsLabel, depth + 1)
    })
  }

  visit(null, '', 0)

  for (const item of sortedItems) {
    if (!visited.has(item.id)) {
      const wbsLabel = String(rows.length + 1)
      rows.push({ ...item, depth: 0, wbsLabel })
    }
  }

  return rows
}

function countByDepth(rows: BaselineRow[], depth: number) {
  return rows.filter((row) => row.depth === depth).length
}

function getBaselineRowType(row: BaselineRow, childParentIds: Set<string>): PlanningTreeRow['rowType'] {
  if (row.is_milestone) return 'milestone'
  if (row.is_wbs_summary || row.is_executable === false) return 'structure'
  if (childParentIds.has(row.id)) return 'structure'
  return 'leaf'
}

function isBaselineValidationExecutable(row: BaselineRow, rowType: PlanningTreeRow['rowType']) {
  if (row.is_milestone) return true
  if (row.is_wbs_summary || row.is_executable === false || rowType === 'structure') return false
  if (row.is_executable === true) return true
  if (isLocalPlanningRowId(row.id)) return rowType === 'leaf'
  if (row.source_task_id || row.source_milestone_id) return rowType === 'leaf'
  return Boolean(row.planned_start_date || row.planned_end_date)
}

function mapPlanningCellKey(field: PlanningTreeCellKey): EditableBaselineField | null {
  if (field === 'title') return 'title'
  if (field === 'start') return 'planned_start_date'
  if (field === 'end') return 'planned_end_date'
  return null
}

function mapValidationFieldToPlanningCell(field: string): PlanningTreeCellKey | null {
  if (field === 'title') return 'title'
  if (field === 'planned_start_date') return 'start'
  if (field === 'planned_end_date') return 'end'
  if (field === 'progress' || field === 'target_progress') return 'progress'
  return null
}

function buildValidationCellMap(issues: ValidationIssue[]) {
  return issues.reduce((map, issue) => {
    const cell = mapValidationFieldToPlanningCell(issue.field)
    if (!cell) return map
    const key = `${issue.rowId}:${cell}`
    const nextIssues = map.get(key) ?? []
    nextIssues.push(issue)
    map.set(key, nextIssues)
    return map
  }, new Map<string, ValidationIssue[]>())
}

function getFirstCellIssue(
  issueMap: Map<string, ValidationIssue[]>,
  rowId: string,
  field: PlanningTreeCellKey,
) {
  return issueMap.get(`${rowId}:${field}`)?.[0]
}

function focusPlanningCell(rowId: string, field: PlanningTreeCellKey = 'title') {
  const selectors = [
    `[data-baseline-editor-cell="${rowId}:${field}"]`,
    `[data-planning-cell="${rowId}:${field}"]`,
    `[data-planning-cell="${rowId}:title"]`,
  ]

  const target = selectors
    .map((selector) => document.querySelector<HTMLElement>(selector))
    .find((element): element is HTMLElement => Boolean(element))
  if (!target) return

  if (typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ block: 'center', inline: 'nearest' })
  }
  window.setTimeout(() => {
    const focusTarget = target.matches('input, textarea, select, button, [tabindex]')
      ? target
      : target.querySelector<HTMLElement>('input, textarea, select, button, [tabindex]')
    focusTarget?.focus()
  }, 0)
}

function focusPlanningValidationIssue(issue: ValidationIssue) {
  focusPlanningCell(issue.rowId, mapValidationFieldToPlanningCell(issue.field) ?? 'title')
}

function getPlanRange(rows: BaselineRow[]) {
  const starts = rows.map((row) => toDateInputValue(row.planned_start_date)).filter(Boolean).sort()
  const ends = rows.map((row) => toDateInputValue(row.planned_end_date)).filter(Boolean).sort()
  return {
    start: starts[0] ?? null,
    end: ends[ends.length - 1] ?? null,
  }
}

function getStatusLabel(version?: BaselineVersion | null) {
  if (!version) return '未建立'
  if (version.status === 'confirmed') return '已确认'
  if (version.status === 'draft') return '待发布'
  if (version.status === 'closed') return '已归档'
  if (version.status === 'revising') return '修订中'
  return '待处理'
}

function isEditableBaselineVersion(version?: BaselineVersion | null) {
  return version?.status === 'draft' || version?.status === 'revising'
}

function cloneBaselineItems(items: BaselineItem[]) {
  return items.map((item) => ({ ...item }))
}

function normalizeBaselineSelectedIds(selectedIds: string[], items: BaselineItem[]) {
  const existingIds = new Set(items.map((item) => item.id))
  return selectedIds.filter((itemId) => existingIds.has(itemId))
}

function buildBaselineEditorSnapshot(items: BaselineItem[], selectedIds: string[]): BaselineEditorSnapshot {
  return {
    items: cloneBaselineItems(items),
    selectedIds: normalizeBaselineSelectedIds(selectedIds, items),
  }
}

function serializeBaselineEditorSnapshot(snapshot: BaselineEditorSnapshot) {
  return JSON.stringify(snapshot)
}

function cloneBaselineItemsForCreate(items: BaselineItem[]) {
  return items.map((item, index) => ({
    parent_item_id: item.parent_item_id ?? null,
    source_task_id: item.source_task_id ?? null,
    source_milestone_id: item.source_milestone_id ?? null,
    title: item.title,
    planned_start_date: item.planned_start_date ?? null,
    planned_end_date: item.planned_end_date ?? null,
    target_progress: item.target_progress ?? null,
    sort_order: item.sort_order ?? index,
    is_milestone: Boolean(item.is_milestone),
    is_critical: Boolean(item.is_critical ?? item.is_baseline_critical),
    mapping_status: item.mapping_status ?? 'mapped',
    notes: item.notes ?? null,
    engineering_category_id: item.engineering_category_id ?? null,
    wbs_node_type: item.wbs_node_type ?? null,
    wbs_path: item.wbs_path ?? null,
    is_wbs_summary: item.is_wbs_summary ?? null,
    is_executable: item.is_executable ?? null,
    standard_work_code: item.standard_work_code ?? null,
    standard_work_name: item.standard_work_name ?? null,
  }))
}

const BASELINE_COMMIT_FIELDS = [
  'parent_item_id',
  'source_task_id',
  'source_milestone_id',
  'title',
  'planned_start_date',
  'planned_end_date',
  'target_progress',
  'sort_order',
  'is_milestone',
  'is_critical',
  'is_baseline_critical',
  'mapping_status',
  'notes',
  'engineering_category_id',
  'wbs_node_type',
  'wbs_path',
  'is_wbs_summary',
  'is_executable',
  'standard_work_code',
  'standard_work_name',
] as const

function isLocalPlanningRowId(rowId: string) {
  return rowId.startsWith('local-')
}

function getTemplateGenerateOperationKey(operation?: PlanningTableOperation | null) {
  const record = (operation ?? {}) as Record<string, unknown>
  return String(record.generationBatchId ?? record.generation_batch_id ?? record.templateId ?? record.template_id ?? '').trim()
}

function normalizeBaselineDraftCompareValue(value: unknown) {
  if (value === undefined || value === '') return null
  return value
}

function buildBaselineCommitValues(item: BaselineItem, index: number) {
  return BASELINE_COMMIT_FIELDS.reduce<Record<string, unknown>>((values, field) => {
    values[field] = field === 'sort_order' ? item.sort_order ?? index : item[field] ?? null
    return values
  }, {})
}

function buildBaselineCommitOperations(baseItems: BaselineItem[], nextItems: BaselineItem[]): PlanningTableOperation[] {
  const baseById = new Map(baseItems.map((item) => [item.id, item]))
  const nextIds = new Set(nextItems.map((item) => item.id))
  const operations: PlanningTableOperation[] = []
  const emittedTemplateGenerateOperations = new Set<string>()

  nextItems.forEach((item, index) => {
    const values = buildBaselineCommitValues(item, index)
    const baseItem = baseById.get(item.id)
    if (!baseItem || isLocalPlanningRowId(item.id)) {
      const templateItem = item as TemplateGeneratedBaselineItem
      if (templateItem.__templateGenerateOperation) {
        const operationKey = getTemplateGenerateOperationKey(templateItem.__templateGenerateOperation)
        if (operationKey && !emittedTemplateGenerateOperations.has(operationKey)) {
          emittedTemplateGenerateOperations.add(operationKey)
          operations.push(templateItem.__templateGenerateOperation)
        }

        const original = templateItem.__templateGenerateRowValues ?? {}
        const changedValues = BASELINE_COMMIT_FIELDS.reduce<Record<string, unknown>>((patch, field) => {
          const nextValue = field === 'sort_order' ? item.sort_order ?? index : item[field] ?? null
          const baseValue = original[field] ?? null
          if (JSON.stringify(normalizeBaselineDraftCompareValue(nextValue)) !== JSON.stringify(normalizeBaselineDraftCompareValue(baseValue))) {
            patch[field] = nextValue
          }
          return patch
        }, {})
        if (Object.keys(changedValues).length > 0) {
          operations.push({ type: 'update_row', rowId: item.id, values: changedValues })
        }
        return
      }

      operations.push({
        type: 'create_row',
        clientRowId: item.id,
        parentId: item.parent_item_id ?? null,
        values,
      })
      return
    }

    const changedValues = BASELINE_COMMIT_FIELDS.reduce<Record<string, unknown>>((patch, field) => {
      const nextValue = field === 'sort_order' ? item.sort_order ?? index : item[field] ?? null
      const baseValue = field === 'sort_order' ? baseItem.sort_order ?? index : baseItem[field] ?? null
      if (JSON.stringify(nextValue) !== JSON.stringify(baseValue)) {
        patch[field] = nextValue
      }
      return patch
    }, {})

    if (Object.keys(changedValues).length > 0) {
      operations.push({ type: 'update_row', rowId: item.id, values: changedValues })
    }
  })

  baseItems.forEach((item) => {
    if (!nextIds.has(item.id)) {
      operations.push({ type: 'delete_row', rowId: item.id })
    }
  })

  return operations
}

type BaselineRowDiffField = {
  label: string
  before: string
  after: string
  cell: PlanningTreeCellKey
  milestoneOnly?: boolean
}

function normalizeBaselineDiffText(value?: string | null) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function addBaselineDiffKey(keys: string[], prefix: string, value?: string | null) {
  const normalized = normalizeBaselineDiffText(value)
  if (normalized) keys.push(`${prefix}:${normalized}`)
}

function getBaselineDiffIdentityKeys(row: BaselineRow) {
  const keys: string[] = []
  addBaselineDiffKey(keys, 'source-task', row.source_task_id)
  addBaselineDiffKey(keys, 'source-milestone', row.source_milestone_id)
  addBaselineDiffKey(keys, 'template-node', row.template_node_id)
  addBaselineDiffKey(keys, 'wbs-path', row.wbs_path)

  const title = normalizeBaselineDiffText(row.title)
  if (title) {
    if (row.wbsLabel) keys.push(`wbs-label:${row.wbsLabel}:${title}`)
    if (row.standard_work_code) keys.push(`standard:${normalizeBaselineDiffText(row.standard_work_code)}:${title}`)
    keys.push(`title:${title}`)
  }

  return keys
}

function indexBaselineRowsByIdentity(rows: BaselineRow[]) {
  const index = new Map<string, BaselineRow[]>()
  rows.forEach((row) => {
    getBaselineDiffIdentityKeys(row).forEach((key) => {
      const bucket = index.get(key) ?? []
      bucket.push(row)
      index.set(key, bucket)
    })
  })
  return index
}

function findMatchingBaselineRow(
  target: BaselineRow,
  sourceIndex: Map<string, BaselineRow[]>,
  unmatchedSourceIds: Set<string>,
) {
  for (const key of getBaselineDiffIdentityKeys(target)) {
    const match = sourceIndex.get(key)?.find((candidate) => unmatchedSourceIds.has(candidate.id))
    if (match) return match
  }
  return null
}

function formatBaselineDiffValue(value?: string | number | boolean | null) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value)
}

function formatBaselineDiffProgress(value?: number | null) {
  return value === null || value === undefined ? '-' : `${value}%`
}

function getBaselineCriticalValue(row: BaselineRow) {
  return Boolean(row.is_critical ?? row.is_baseline_critical)
}

function formatBaselineRowSummary(row: BaselineRow) {
  const dates = `${toDateOnly(row.planned_start_date)} → ${toDateOnly(row.planned_end_date)}`
  const flags = [
    row.is_milestone ? '里程碑' : null,
    getBaselineCriticalValue(row) ? '关键线路' : null,
  ].filter(Boolean)
  return [`${row.wbsLabel} ${row.title}`, dates, ...flags].join(' · ')
}

function getBaselineRowDiffFields(before: BaselineRow, after: BaselineRow): BaselineRowDiffField[] {
  const fields: BaselineRowDiffField[] = [
    {
      label: '任务名称',
      before: formatBaselineDiffValue(before.title),
      after: formatBaselineDiffValue(after.title),
      cell: 'title',
    },
    {
      label: '计划开始',
      before: toDateOnly(before.planned_start_date),
      after: toDateOnly(after.planned_start_date),
      cell: 'start',
    },
    {
      label: '计划完成',
      before: toDateOnly(before.planned_end_date),
      after: toDateOnly(after.planned_end_date),
      cell: 'end',
    },
    {
      label: '目标进度',
      before: formatBaselineDiffProgress(before.target_progress),
      after: formatBaselineDiffProgress(after.target_progress),
      cell: 'progress',
    },
    {
      label: '里程碑',
      before: formatBaselineDiffValue(Boolean(before.is_milestone)),
      after: formatBaselineDiffValue(Boolean(after.is_milestone)),
      cell: 'title',
      milestoneOnly: true,
    },
    {
      label: '关键线路',
      before: formatBaselineDiffValue(getBaselineCriticalValue(before)),
      after: formatBaselineDiffValue(getBaselineCriticalValue(after)),
      cell: 'title',
    },
    {
      label: '计划依据状态',
      before: formatBaselineDiffValue(before.mapping_status),
      after: formatBaselineDiffValue(after.mapping_status),
      cell: 'title',
    },
    {
      label: '节点类型',
      before: formatBaselineDiffValue(before.wbs_node_type ?? before.engineering_category_type),
      after: formatBaselineDiffValue(after.wbs_node_type ?? after.engineering_category_type),
      cell: 'title',
    },
  ]

  return fields.filter((field) => field.before !== field.after)
}

function buildBaselineDiffItems(fromRows: BaselineRow[], toRows: BaselineRow[]): BaselineDiffItem[] {
  const sourceIndex = indexBaselineRowsByIdentity(fromRows)
  const sourceById = new Map(fromRows.map((row) => [row.id, row]))
  const unmatchedSourceIds = new Set(fromRows.map((row) => row.id))
  const diffItems: BaselineDiffItem[] = []

  toRows.forEach((targetRow) => {
    const sourceRow = findMatchingBaselineRow(targetRow, sourceIndex, unmatchedSourceIds)
    if (!sourceRow) {
      diffItems.push({
        id: `added-${targetRow.id}`,
        kind: '新增',
        title: targetRow.title,
        before: '-',
        after: formatBaselineRowSummary(targetRow),
        note: '当前版本新增该计划行。',
        rowId: targetRow.id,
        field: 'title',
      })
      return
    }

    unmatchedSourceIds.delete(sourceRow.id)
    const changedFields = getBaselineRowDiffFields(sourceRow, targetRow)
    if (changedFields.length === 0) return

    diffItems.push({
      id: `changed-${targetRow.id}`,
      kind: changedFields.every((field) => field.milestoneOnly) ? '里程碑变动' : '修改',
      title: targetRow.title,
      before: formatBaselineRowSummary(sourceRow),
      after: formatBaselineRowSummary(targetRow),
      note: changedFields.map((field) => `${field.label}: ${field.before} → ${field.after}`).join('；'),
      rowId: targetRow.id,
      field: changedFields[0]?.cell ?? 'title',
    })
  })

  unmatchedSourceIds.forEach((sourceId) => {
    const sourceRow = sourceById.get(sourceId)
    if (!sourceRow) return
    diffItems.push({
      id: `removed-${sourceRow.id}`,
      kind: '移除',
      title: sourceRow.title,
      before: formatBaselineRowSummary(sourceRow),
      after: '-',
      note: '当前版本已移除该计划行。',
    })
  })

  return diffItems
}

function PlanningPresenceContractAnchor({
  presence: _presence,
  onActiveCellChange: _onActiveCellChange,
}: {
  presence: ReturnType<typeof usePlanningPresence>
  onActiveCellChange: (cell: PlanningPresenceCell | null) => void
}) {
  return null
}

export default function BaselinePage() {
  const { id: routeProjectId } = useParams()
  const currentProject = useStore((state) => state.currentProject)
  const currentUser = useStore((state) => state.currentUser)
  const lastRealtimeEvent = useStore((state) => state.lastRealtimeEvent)
  const projectId = currentProject?.id ?? routeProjectId ?? ''
  const projectName = currentProject?.name ?? '当前项目'
  const fieldConfigStorageKey = useMemo(
    () => getPlanningFieldConfigStorageKey(projectId, 'baseline', currentUser?.id),
    [currentUser?.id, projectId],
  )

  const [versions, setVersions] = useState<BaselineVersion[]>([])
  const [activeBaseline, setActiveBaseline] = useState<BaselineDetail | null>(null)
  const [items, setItems] = useState<BaselineItem[]>([])
  const [isEditable, setIsEditable] = useState(false)
  const [loading, setLoading] = useState(true)
  const { viewMode, setViewMode } = usePlanningViewMode({
    projectId,
    surface: 'baseline',
    userId: currentUser?.id,
    rowMode: isEditable ? 'edit' : 'read',
  })
  const [error, setError] = useState<string | null>(null)
  const [statusNotice, setStatusNotice] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [recordsOpen, setRecordsOpen] = useState(false)
  const [diffOpen, setDiffOpen] = useState(false)
  const [diffBaseBaseline, setDiffBaseBaseline] = useState<BaselineDetail | null>(null)
  const [remoteDiff, setRemoteDiff] = useState<BaselineDiffResponse | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [generationCandidate, setGenerationCandidate] = useState<BaselineGenerationCandidate | null>(null)
  const [candidateDetailsOpen, setCandidateDetailsOpen] = useState(false)
  const [dismissedCandidateBaselineId, setDismissedCandidateBaselineId] = useState<string | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishCauseCode, setPublishCauseCode] = useState<BaselinePublishCauseCode>('workflow_sequence')
  const [publishChangeReason, setPublishChangeReason] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [templateGenerateOpen, setTemplateGenerateOpen] = useState(false)
  const [inlineTemplateGenerateItemId, setInlineTemplateGenerateItemId] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const historyRef = useRef<BaselineEditorSnapshot[]>([])
  const historyCursorRef = useRef(-1)
  const lastHandledRealtimeEventKeyRef = useRef('')
  const [, forceHistoryRender] = useState(0)

  const rows = useMemo(() => buildBaselineRows(items), [items])
  const baselineValidationInputs = useMemo<ValidationInput[]>(() => {
    const childParentIds = new Set(items.map((item) => item.parent_item_id).filter((id): id is string => Boolean(id)))
    return rows.map((row) => {
      const rowType = getBaselineRowType(row, childParentIds)
      return {
        rowId: row.id,
        title: row.title,
        plannedStartDate: row.planned_start_date ?? null,
        plannedEndDate: row.planned_end_date ?? null,
        progress: row.target_progress ?? null,
        isMilestone: Boolean(row.is_milestone),
        isExecutable: isBaselineValidationExecutable(row, rowType),
        parentId: row.parent_item_id ?? null,
      }
    })
  }, [items, rows])
  const baselineValidation = usePlanningValidation(baselineValidationInputs, {
    requireEngineeringObject: false,
    requireParticipantUnit: false,
  })
  const baselineValidationCellMap = useMemo(
    () => buildValidationCellMap(baselineValidation.issues),
    [baselineValidation.issues],
  )
  const normalizedSelectedItemIds = useMemo(() => {
    const existingIds = new Set(items.map((item) => item.id))
    return selectedItemIds.filter((itemId) => existingIds.has(itemId))
  }, [items, selectedItemIds])
  const planRange = useMemo(() => getPlanRange(rows), [rows])
  // eslint-disable-next-line -- frontend-bi-aggregation-approved
  const milestoneCount = useMemo(() => rows.filter((row) => row.is_milestone).length, [rows])
  const canEditActiveBaseline = isEditableBaselineVersion(activeBaseline)
  const currentVersion = useMemo(
    () => versions.find((version) => version.is_current_execution)
      ?? versions.find((version) => version.status === 'confirmed')
      ?? versions[0]
      ?? null,
    [versions],
  )
  const baselinePresence = usePlanningPresence({
    projectId,
    resourceType: 'baseline',
    resourceId: activeBaseline?.id ?? currentVersion?.id ?? 'baseline',
    enabled: Boolean(projectId) && !import.meta.env.TEST,
  })
  const fieldRegistry = usePlanningFieldRegistry(projectId, 'baseline')
  const conflictFieldGroups = useMemo(
    () => buildPlanningConflictFieldGroups(fieldRegistry.registry?.fields),
    [fieldRegistry.registry?.fields],
  )
  const conflictFields = useMemo(
    () => fieldRegistry.registry?.fields.map((field) => field.key),
    [fieldRegistry.registry?.fields],
  )
  const resolvedDiffBaseBaseline = useMemo(() => {
    if (!activeBaseline) return null
    if (currentVersion?.id === activeBaseline.id) return activeBaseline
    if (diffBaseBaseline) return diffBaseBaseline
    return null
  }, [activeBaseline, currentVersion?.id, diffBaseBaseline])
  const localBaselineDiffItems = useMemo(() => {
    if (!activeBaseline || !resolvedDiffBaseBaseline) return []
    return buildBaselineDiffItems(buildBaselineRows(resolvedDiffBaseBaseline.items ?? []), rows)
  }, [activeBaseline, resolvedDiffBaseBaseline, rows])
  const baselineDiffItems = remoteDiff?.items ?? localBaselineDiffItems
  const diffFromVersionLabel = remoteDiff?.fromVersionLabel ?? getVersionLabel(resolvedDiffBaseBaseline ?? currentVersion)
  const diffToVersionLabel = remoteDiff?.toVersionLabel ?? getVersionLabel(activeBaseline)

  const applyBaselineEditorSnapshot = useCallback((snapshot: BaselineEditorSnapshot) => {
    setItems(cloneBaselineItems(snapshot.items))
    setSelectedItemIds(snapshot.selectedIds)
  }, [])

  const resetBaselineHistory = useCallback((nextItems: BaselineItem[], nextSelectedIds: string[] = []) => {
    const snapshot = buildBaselineEditorSnapshot(nextItems, nextSelectedIds)
    historyRef.current = [snapshot]
    historyCursorRef.current = 0
    forceHistoryRender((value) => value + 1)
  }, [])

  const commitBaselineEditorSnapshot = useCallback((
    nextItems: BaselineItem[],
    nextSelectedIds: string[] = selectedItemIds,
    options?: { recordHistory?: boolean },
  ) => {
    const snapshot = buildBaselineEditorSnapshot(nextItems, nextSelectedIds)

    if (options?.recordHistory === false) {
      applyBaselineEditorSnapshot(snapshot)
      return
    }

    const currentSnapshot = historyRef.current[historyCursorRef.current]
    if (currentSnapshot && serializeBaselineEditorSnapshot(currentSnapshot) === serializeBaselineEditorSnapshot(snapshot)) {
      applyBaselineEditorSnapshot(snapshot)
      return
    }

    const nextHistory = [
      ...historyRef.current.slice(0, historyCursorRef.current + 1),
      snapshot,
    ]
    historyRef.current = nextHistory.slice(-BASELINE_HISTORY_LIMIT)
    historyCursorRef.current = historyRef.current.length - 1
    applyBaselineEditorSnapshot(snapshot)
    forceHistoryRender((value) => value + 1)
  }, [applyBaselineEditorSnapshot, selectedItemIds])

  const canUndoBaselineEdit = isEditable && historyCursorRef.current > 0
  const canRedoBaselineEdit = isEditable &&
    historyCursorRef.current >= 0 &&
    historyCursorRef.current < historyRef.current.length - 1

  const loadBaseline = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) return

    setLoading(true)
    setError(null)

    try {
      const nextVersions = await apiGet<BaselineVersion[]>(
        `/api/task-baselines?project_id=${encodeURIComponent(projectId)}`,
        { signal },
      )
      setVersions(nextVersions)

      const targetVersion = nextVersions.find((version) => version.is_current_execution)
        ?? nextVersions.find((version) => version.status === 'confirmed')
        ?? nextVersions[0]
        ?? null

      if (!targetVersion) {
        setActiveBaseline(null)
        setItems([])
        setSelectedItemIds([])
        resetBaselineHistory([], [])
        setIsEditable(true)
        return
      }

      const detail = await apiGet<BaselineDetail>(
        `/api/task-baselines/${targetVersion.id}?project_id=${encodeURIComponent(projectId)}`,
        { signal },
      )
      setActiveBaseline(detail)
      setItems(detail.items ?? [])
      setSelectedItemIds([])
      resetBaselineHistory(detail.items ?? [], [])
      setIsEditable(isEditableBaselineVersion(detail))
      setStatusNotice(null)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      const message = caught instanceof Error ? caught.message : '项目基线加载失败'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [projectId, resetBaselineHistory])

  useEffect(() => {
    const controller = new AbortController()
    void loadBaseline(controller.signal)
    return () => controller.abort()
  }, [loadBaseline])

  useEffect(() => {
    setDiffBaseBaseline(null)
    setRemoteDiff(null)
    setDiffError(null)
    setDiffLoading(false)
  }, [activeBaseline?.id, currentVersion?.id])

  useEffect(() => {
    const baselineId = activeBaseline?.id
    const canLoadCandidate = Boolean(
      projectId
        && baselineId
        && !isEditable
        && activeBaseline?.status === 'confirmed'
        && activeBaseline?.is_current_execution !== false,
    )

    if (!canLoadCandidate || dismissedCandidateBaselineId === baselineId) {
      setGenerationCandidate(null)
      return
    }

    const controller = new AbortController()
    void apiGet<BaselineGenerationCandidate>(
      `/api/task-baselines/${baselineId}/generation-candidate?project_id=${encodeURIComponent(projectId)}`,
      { signal: controller.signal },
    )
      .then((candidate) => {
        setGenerationCandidate(candidate.recommended ? candidate : null)
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setGenerationCandidate(null)
      })

    return () => controller.abort()
  }, [
    activeBaseline?.id,
    activeBaseline?.is_current_execution,
    activeBaseline?.status,
    dismissedCandidateBaselineId,
    isEditable,
    projectId,
  ])

  useEffect(() => {
    if (!projectId || !lastRealtimeEvent) return
    if (lastRealtimeEvent.type !== 'planning.table.changed') return
    if (lastRealtimeEvent.channel !== 'project' || lastRealtimeEvent.projectId !== projectId) return
    if (String(lastRealtimeEvent.entityType ?? '').trim() !== 'baseline') return

    const eventResourceId = String(
      lastRealtimeEvent.entityId ?? lastRealtimeEvent.payload?.resourceId ?? '',
    ).trim()
    if (activeBaseline?.id && eventResourceId && eventResourceId !== activeBaseline.id) return

    const eventKey = [
      lastRealtimeEvent.timestamp,
      lastRealtimeEvent.type,
      lastRealtimeEvent.projectId ?? '',
      eventResourceId,
    ].join(':')
    if (lastHandledRealtimeEventKeyRef.current === eventKey) return
    lastHandledRealtimeEventKeyRef.current = eventKey

    const hasLocalEdits = isEditable && historyCursorRef.current > 0
    if (hasLocalEdits) {
      setStatusNotice('有协作更新，保存时将自动合并')
      return
    }

    const controller = new AbortController()
    void loadBaseline(controller.signal)
    return () => controller.abort()
  }, [
    activeBaseline?.id,
    isEditable,
    lastRealtimeEvent,
    loadBaseline,
    projectId,
  ])

  const updateItemField = useCallback((itemId: string, field: EditableBaselineField, value: string) => {
    commitBaselineEditorSnapshot(items.map((item) => (
      item.id === itemId ? { ...item, [field]: value } : item
    )))
  }, [commitBaselineEditorSnapshot, items])

  const createLocalItem = useCallback((parentId: string | null, title: string, afterItem?: BaselineItem) => {
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const parentSiblings = items.filter((item) => (item.parent_item_id ?? null) === parentId)
    const sortOrder = afterItem ? (afterItem.sort_order ?? 0) + 1 : parentSiblings.length
    const nextItem: BaselineItem = {
      id,
      project_id: projectId,
      baseline_version_id: activeBaseline?.id ?? 'local-baseline',
      parent_item_id: parentId,
      title,
      planned_start_date: afterItem?.planned_start_date ?? null,
      planned_end_date: afterItem?.planned_end_date ?? null,
      sort_order: sortOrder,
      is_milestone: false,
      is_critical: false,
      is_wbs_summary: false,
      is_executable: true,
      mapping_status: 'pending',
      notes: null,
    }
    commitBaselineEditorSnapshot([...items, nextItem])
    setIsEditable(true)
  }, [activeBaseline?.id, commitBaselineEditorSnapshot, items, projectId])

  const deleteLocalItem = useCallback((itemId: string) => {
    const descendants = new Set<string>([itemId])
    let changed = true
    while (changed) {
      changed = false
      for (const item of items) {
        if (item.parent_item_id && descendants.has(item.parent_item_id) && !descendants.has(item.id)) {
          descendants.add(item.id)
          changed = true
        }
      }
    }
    const nextItems = items.filter((item) => !descendants.has(item.id))
    commitBaselineEditorSnapshot(
      nextItems,
      selectedItemIds.filter((itemId) => !descendants.has(itemId)),
    )
  }, [commitBaselineEditorSnapshot, items, selectedItemIds])

  const deleteLocalItems = useCallback((itemIds: string[]) => {
    if (itemIds.length === 0) return
    const descendants = new Set(itemIds)
    let changed = true
    while (changed) {
      changed = false
      for (const item of items) {
        if (item.parent_item_id && descendants.has(item.parent_item_id) && !descendants.has(item.id)) {
          descendants.add(item.id)
          changed = true
        }
      }
    }
    const nextItems = items.filter((item) => !descendants.has(item.id))
    commitBaselineEditorSnapshot(
      nextItems,
      selectedItemIds.filter((itemId) => !descendants.has(itemId)),
    )
  }, [commitBaselineEditorSnapshot, items, selectedItemIds])

  const toggleMilestone = useCallback((itemId: string) => {
    commitBaselineEditorSnapshot(items.map((item) => (
      item.id === itemId ? { ...item, is_milestone: !item.is_milestone } : item
    )))
  }, [commitBaselineEditorSnapshot, items])

  const handleToggleRow = useCallback((itemId: string) => {
    setSelectedItemIds((currentIds) => (
      currentIds.includes(itemId)
        ? currentIds.filter((id) => id !== itemId)
        : [...currentIds, itemId]
    ))
  }, [])

  const handleToggleAll = useCallback((checked: boolean) => {
    setSelectedItemIds(checked ? rows.map((row) => row.id) : [])
  }, [rows])

  const handleUpdateCells = useCallback((updates: PlanningTreeCellUpdate[]) => {
    if (updates.length === 0) return
    commitBaselineEditorSnapshot(items.map((item) => {
      let nextItem = item
      updates
        .filter((update) => update.rowId === item.id)
        .forEach((update) => {
          const field = mapPlanningCellKey(update.field)
          if (!field) return
          nextItem = { ...nextItem, [field]: update.value }
        })
      return nextItem
    }))
  }, [commitBaselineEditorSnapshot, items])

  const handleFillRows = useCallback((rowIds: string[], row: PlanningTreeClipboardRow) => {
    if (rowIds.length === 0) return
    const targetIds = new Set(rowIds)
    commitBaselineEditorSnapshot(items.map((item) => {
      if (!targetIds.has(item.id)) return item
      return {
        ...item,
        title: row.title || item.title,
        planned_start_date: row.plannedStartDate ?? item.planned_start_date ?? null,
        planned_end_date: row.plannedEndDate ?? item.planned_end_date ?? null,
        is_milestone: row.isMilestone ?? item.is_milestone,
      }
    }))
  }, [commitBaselineEditorSnapshot, items])

  const handlePasteRows = useCallback((pastedRows: PlanningTreeClipboardRow[], anchorRowId?: string | null) => {
    if (pastedRows.length === 0) return
    const rowById = new Map(rows.map((row) => [row.id, row]))
    const anchorRow = anchorRowId ? rowById.get(anchorRowId) : null
    const defaultParentId = anchorRow?.parent_item_id ?? null
    const baseSortOrder = anchorRow ? (anchorRow.sort_order ?? 0) + 1 : items.length
    const createdByDepth = new Map<number, BaselineItem>()
    const createdItems = pastedRows.map((row, index) => {
      const targetDepth = Math.max(0, (row.depth ?? ((anchorRow?.depth ?? -1) + 1)) - 1)
      const parentItem = targetDepth > 0 ? createdByDepth.get(targetDepth - 1) : null
      const parentId = parentItem?.id ?? defaultParentId
      const nextItem: BaselineItem = {
        id: `local-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        project_id: projectId,
        baseline_version_id: activeBaseline?.id ?? 'local-baseline',
        parent_item_id: parentId,
        source_task_id: null,
        source_milestone_id: null,
        title: row.title || '新计划项',
        planned_start_date: row.plannedStartDate ?? null,
        planned_end_date: row.plannedEndDate ?? null,
        target_progress: row.targetProgress ?? null,
        sort_order: baseSortOrder + index,
        is_milestone: Boolean(row.isMilestone),
        is_critical: false,
        is_wbs_summary: false,
        is_executable: true,
        mapping_status: 'pending',
        notes: null,
      }
      createdByDepth.set(targetDepth, nextItem)
      return nextItem
    })
    commitBaselineEditorSnapshot([...items, ...createdItems])
    setIsEditable(true)
  }, [activeBaseline?.id, commitBaselineEditorSnapshot, items, projectId, rows])

  const handleApplyTemplateGeneratedBaseline = useCallback((
    preview: WbsTemplateGeneratePreview,
    context: WbsTemplateGenerateApplyContext,
  ) => {
    if (!projectId) return
    const generatedRows = preview.previewRows ?? preview.rows ?? []
    if (generatedRows.length === 0) {
      setStatusNotice('模板没有生成可用计划行。')
      return
    }

    const templateGenerateOperation: PlanningTableOperation = {
      type: 'template_generate',
      generationBatchId: preview.generationBatchId,
      templateId: context.templateId,
      selectedNodeIds: context.selectedNodeIds,
      scope: context.scope,
      attachUnderRowId: context.attachUnderRowId ?? null,
      generationDepth: context.generationDepth,
      includeActivitySteps: context.includeActivitySteps,
      duplicatePolicy: context.duplicatePolicy,
      previewRows: generatedRows,
      generationBatches: preview.generationBatches,
      rowLimitPolicy: preview.rowLimitPolicy,
      plannedStartDate: context.plannedStartDate,
      sortOrder: context.sortOrder ?? items.length,
    }

    const createdItems = generatedRows.map((row, index): BaselineItem => {
      const values = row.values ?? {}
      const title = String(values.title ?? values.name ?? `模板计划 ${index + 1}`).trim() || `模板计划 ${index + 1}`
      const plannedStartDate = toDateInputValue(String(values.planned_start_date ?? values.start_date ?? context.plannedStartDate))
        || context.plannedStartDate
      const plannedEndDate = toDateInputValue(String(values.planned_end_date ?? values.end_date ?? plannedStartDate))
        || plannedStartDate
      const rawProgress = Number(values.target_progress ?? values.progress ?? 0)

      return {
        id: String(row.clientRowId || `local-template-${Date.now()}-${index}`),
        project_id: projectId,
        baseline_version_id: activeBaseline?.id ?? 'local-baseline',
        parent_item_id: row.parentClientRowId ?? row.parentRowId ?? null,
        source_task_id: null,
        source_milestone_id: null,
        template_id: String(values.template_id ?? context.templateId),
        template_node_id: values.template_node_id ? String(values.template_node_id) : null,
        title,
        planned_start_date: plannedStartDate,
        planned_end_date: plannedEndDate,
        target_progress: Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, Math.round(rawProgress))) : 0,
        sort_order: Number(row.sortOrder ?? index),
        is_milestone: Boolean(values.is_milestone),
        is_critical: Boolean(values.is_critical),
        is_wbs_summary: values.is_wbs_summary == null ? !['process', 'activity_step'].includes(String(values.wbs_node_type ?? '')) : Boolean(values.is_wbs_summary),
        is_executable: values.is_executable == null ? ['process', 'activity_step'].includes(String(values.wbs_node_type ?? '')) : Boolean(values.is_executable),
        mapping_status: 'pending',
        notes: null,
        engineering_category_id: values.engineering_category_id ? String(values.engineering_category_id) : null,
        wbs_node_type: values.wbs_node_type ? String(values.wbs_node_type) : null,
        wbs_path: values.wbs_path ? String(values.wbs_path) : null,
        standard_work_code: values.standard_work_code ? String(values.standard_work_code) : null,
        standard_work_name: values.standard_work_name ? String(values.standard_work_name) : null,
        __templateGenerateOperation: templateGenerateOperation,
        __templateGenerateRowValues: {
          parent_item_id: row.parentClientRowId ?? row.parentRowId ?? null,
          title,
          planned_start_date: plannedStartDate,
          planned_end_date: plannedEndDate,
          target_progress: Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, Math.round(rawProgress))) : 0,
          sort_order: Number(row.sortOrder ?? index),
          is_milestone: Boolean(values.is_milestone),
          is_critical: Boolean(values.is_critical),
          is_baseline_critical: Boolean(values.is_baseline_critical),
          mapping_status: 'pending',
          notes: null,
          template_id: String(values.template_id ?? context.templateId),
          template_node_id: values.template_node_id ? String(values.template_node_id) : null,
          engineering_category_id: values.engineering_category_id ? String(values.engineering_category_id) : null,
          wbs_node_type: values.wbs_node_type ? String(values.wbs_node_type) : null,
          wbs_path: values.wbs_path ? String(values.wbs_path) : null,
          is_wbs_summary: values.is_wbs_summary == null ? !['process', 'activity_step'].includes(String(values.wbs_node_type ?? '')) : Boolean(values.is_wbs_summary),
          is_executable: values.is_executable == null ? ['process', 'activity_step'].includes(String(values.wbs_node_type ?? '')) : Boolean(values.is_executable),
          standard_work_code: values.standard_work_code ? String(values.standard_work_code) : null,
          standard_work_name: values.standard_work_name ? String(values.standard_work_name) : null,
        },
      } as TemplateGeneratedBaselineItem
    })

    commitBaselineEditorSnapshot([...items, ...createdItems], createdItems.map((item) => item.id))
    setIsEditable(true)
    setStatusNotice(`已从 ${context.templateName} 生成 ${createdItems.length} 行计划草稿，保存后写入当前基线草稿。`)
  }, [activeBaseline?.id, commitBaselineEditorSnapshot, items, projectId])

  const promoteItem = useCallback((itemId: string) => {
    const item = items.find((candidate) => candidate.id === itemId)
    if (!item?.parent_item_id) return
    const parent = items.find((candidate) => candidate.id === item.parent_item_id)
    commitBaselineEditorSnapshot(items.map((candidate) => (
      candidate.id === itemId ? { ...candidate, parent_item_id: parent?.parent_item_id ?? null } : candidate
    )))
  }, [commitBaselineEditorSnapshot, items])

  const demoteItem = useCallback((itemId: string) => {
    const rowIndex = rows.findIndex((row) => row.id === itemId)
    const row = rows[rowIndex]
    if (!row) return
    const previousSibling = [...rows.slice(0, rowIndex)]
      .reverse()
      .find((candidate) => (candidate.parent_item_id ?? null) === (row.parent_item_id ?? null))
    if (!previousSibling) return
    commitBaselineEditorSnapshot(items.map((candidate) => (
      candidate.id === itemId ? { ...candidate, parent_item_id: previousSibling.id } : candidate
    )))
  }, [commitBaselineEditorSnapshot, items, rows])

  const moveItem = useCallback((itemId: string, direction: -1 | 1) => {
    const row = rows.find((candidate) => candidate.id === itemId)
    if (!row) return
    const siblings = rows.filter((candidate) => (candidate.parent_item_id ?? null) === (row.parent_item_id ?? null))
    const currentIndex = siblings.findIndex((candidate) => candidate.id === itemId)
    const nextSibling = siblings[currentIndex + direction]
    if (!nextSibling) return
    commitBaselineEditorSnapshot(items.map((candidate) => {
      if (candidate.id === row.id) return { ...candidate, sort_order: nextSibling.sort_order ?? currentIndex }
      if (candidate.id === nextSibling.id) return { ...candidate, sort_order: row.sort_order ?? currentIndex + direction }
      return candidate
    }))
  }, [commitBaselineEditorSnapshot, items, rows])

  const getAlignedBaselineItemsBeforeSave = useCallback(async () => {
    if (!projectId || !activeBaseline?.id) return items

    const latest = await apiGet<BaselineDetail>(
      `/api/task-baselines/${activeBaseline.id}?project_id=${encodeURIComponent(projectId)}`,
    )
    const mergeResult = mergePlanningItemsBeforeSave(activeBaseline.items ?? [], items, latest.items ?? [], {
      fields: conflictFields,
      fieldGroups: conflictFieldGroups,
    })
    if (mergeResult.conflictCount > 0) {
      const labels = mergeResult.conflictLabels.slice(0, 3).join('、')
      throw new Error(`${mergeResult.conflictCount} 个计划条目刚被他人更新，请确认后继续${labels ? `：${labels}` : ''}`)
    }

    if (mergeResult.mergedCount > 0) {
      setItems(mergeResult.items)
      setStatusNotice(`已合并他人的 ${mergeResult.mergedCount} 处无关修改`)
    }

    return mergeResult.items
  }, [activeBaseline, conflictFieldGroups, conflictFields, items, projectId])

  const getBaselineFieldRegistryVersion = useCallback(async () => {
    const currentVersion = fieldRegistry.registry?.registryVersion
    if (currentVersion) return currentVersion

    const refreshedRegistry = await fieldRegistry.refetch()
    const refreshedVersion = refreshedRegistry?.registryVersion
    if (!refreshedVersion) {
      throw new Error('字段注册表未加载，无法保存项目基线')
    }
    return refreshedVersion
  }, [fieldRegistry.refetch, fieldRegistry.registry?.registryVersion])

  const handleGenerateVersion = useCallback(async () => {
    if (!projectId || generating || isEditable) return

    setGenerating(true)
    setError(null)

    try {
      const generated = await apiPost<BaselineDetail>(
        '/api/task-baselines/generate',
        {
          project_id: projectId,
        },
      )
      setActiveBaseline(generated)
      setItems(generated.items ?? [])
      setSelectedItemIds([])
      resetBaselineHistory(generated.items ?? [], [])
      setIsEditable(true)
      setGenerationCandidate(null)
      setCandidateDetailsOpen(false)
      setDismissedCandidateBaselineId((currentVersion ?? activeBaseline)?.id ?? null)
      setStatusNotice('已根据当前任务列表生成新版基线，可直接在表格中调整。')
      setVersions((currentVersions) => {
        const withoutGenerated = currentVersions.filter((version) => version.id !== generated.id)
        return [generated, ...withoutGenerated]
      })
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '生成新版基线失败'
      setError(message)
    } finally {
      setGenerating(false)
    }
  }, [activeBaseline, currentVersion, generating, isEditable, projectId, resetBaselineHistory])

  const handleSaveDraft = useCallback(async () => {
    if (!projectId || !activeBaseline) return
    if (baselineValidation.blockCount > 0) {
      setError(`请先处理 ${baselineValidation.blockCount} 项表格校核问题后再保存。`)
      const firstBlocker = baselineValidation.issues.find((issue) => issue.severity === 'block_save')
        ?? baselineValidation.issues[0]
      if (firstBlocker) focusPlanningValidationIssue(firstBlocker)
      return
    }

    setPublishing(true)
    setError(null)
    try {
      const alignedItems = await getAlignedBaselineItemsBeforeSave()
      const operations = buildBaselineCommitOperations(activeBaseline.items ?? [], alignedItems)
      let savedItems = alignedItems
      if (operations.length > 0) {
        const fieldRegistryVersion = await getBaselineFieldRegistryVersion()
        const committed = await commitPlanningTable<BaselineItem>({
          projectId,
          surface: 'baseline',
          resourceId: activeBaseline.id,
          baseVersion: activeBaseline.version ?? undefined,
          fieldRegistryVersion,
          operations,
          clientContext: {
            rollupRows: alignedItems,
          },
        })
        savedItems = committed.rows
        setItems(committed.rows)
        setActiveBaseline((current) => current ? { ...current, items: committed.rows, updated_at: new Date().toISOString() } : current)
      }
      resetBaselineHistory(savedItems, [])
      setSelectedItemIds([])
      setIsEditable(false)
      setStatusNotice('已保存当前项目基线草稿。')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '保存项目基线草稿失败'
      setError(message)
    } finally {
      setPublishing(false)
    }
  }, [
    activeBaseline,
    baselineValidation.blockCount,
    baselineValidation.issues,
    getAlignedBaselineItemsBeforeSave,
    getBaselineFieldRegistryVersion,
    projectId,
    resetBaselineHistory,
  ])

  const handleCancelEdit = useCallback(() => {
    const restoredItems = activeBaseline?.items ?? []
    setItems(cloneBaselineItems(restoredItems))
    setSelectedItemIds([])
    resetBaselineHistory(restoredItems, [])
    setIsEditable(false)
  }, [activeBaseline?.items, resetBaselineHistory])

  const handlePublishBaseline = useCallback(async () => {
    const normalizedChangeReason = publishChangeReason.trim()
    if (!projectId || !activeBaseline || publishing || isEditable || !normalizedChangeReason) return
    setPublishing(true)
    setError(null)
    try {
      const nextDetail = await apiPost<BaselineDetail>(
        `/api/task-baselines/${activeBaseline.id}/publish`,
        {
          project_id: projectId,
          cause_code: publishCauseCode,
          change_reason: normalizedChangeReason,
        },
      )

      setActiveBaseline(nextDetail)
      setItems(nextDetail.items ?? [])
      setSelectedItemIds([])
      resetBaselineHistory(nextDetail.items ?? [], [])
      setVersions((currentVersions) => [
        nextDetail,
        ...currentVersions
          .filter((version) => version.id !== nextDetail.id)
          .map((version) => ({ ...version, is_current_execution: false })),
      ])
      setIsEditable(false)
      setPublishOpen(false)
      setPublishChangeReason('')
      setStatusNotice('已发布新版项目基线。')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '发布项目基线失败'
      setError(message)
    } finally {
      setPublishing(false)
    }
  }, [
    activeBaseline,
    isEditable,
    projectId,
    publishCauseCode,
    publishChangeReason,
    publishing,
    resetBaselineHistory,
  ])

  const handleStartEdit = useCallback(() => {
    if (!canEditActiveBaseline) return
    resetBaselineHistory(items, normalizedSelectedItemIds)
    setIsEditable(true)
  }, [canEditActiveBaseline, items, normalizedSelectedItemIds, resetBaselineHistory])

  const handleOpenCurrentDiff = useCallback(async () => {
    if (!projectId || !activeBaseline) return

    setDiffOpen(true)
    setDiffError(null)
    setRemoteDiff(null)

    const baseVersion = currentVersion ?? activeBaseline
    if (baseVersion.id === activeBaseline.id) {
      setDiffBaseBaseline(activeBaseline)
      setDiffLoading(false)
      return
    }

    setDiffLoading(true)
    try {
      const params = new URLSearchParams({
        project_id: projectId,
        compareTo: baseVersion.id,
      })
      const diff = await apiGet<BaselineDiffResponse>(
        `/api/task-baselines/${activeBaseline.id}/diff?${params.toString()}`,
      )
      setRemoteDiff(diff)
      setDiffBaseBaseline(null)
    } catch (primaryError) {
      try {
        const detail = await apiGet<BaselineDetail>(
          `/api/task-baselines/${baseVersion.id}?project_id=${encodeURIComponent(projectId)}`,
        )
        setDiffBaseBaseline(detail)
      } catch (fallbackError) {
        const message = fallbackError instanceof Error
          ? fallbackError.message
          : primaryError instanceof Error
            ? primaryError.message
            : '加载基线差异失败'
        setDiffBaseBaseline(null)
        setDiffError(message)
      }
    } finally {
      setDiffLoading(false)
    }
  }, [activeBaseline, currentVersion, projectId])

  const handleLocateBaselineDiffItem = useCallback((item: BaselineDiffItem) => {
    if (!item.rowId) return
    const rowId = item.rowId
    setDiffOpen(false)
    window.setTimeout(() => {
      focusPlanningCell(rowId, item.field ?? 'title')
    }, 0)
  }, [])

  const handleUndo = useCallback(() => {
    if (!canUndoBaselineEdit) return
    historyCursorRef.current -= 1
    const snapshot = historyRef.current[historyCursorRef.current]
    if (!snapshot) return
    commitBaselineEditorSnapshot(snapshot.items, snapshot.selectedIds, { recordHistory: false })
    forceHistoryRender((value) => value + 1)
  }, [canUndoBaselineEdit, commitBaselineEditorSnapshot])

  const handleRedo = useCallback(() => {
    if (!canRedoBaselineEdit) return
    historyCursorRef.current += 1
    const snapshot = historyRef.current[historyCursorRef.current]
    if (!snapshot) return
    commitBaselineEditorSnapshot(snapshot.items, snapshot.selectedIds, { recordHistory: false })
    forceHistoryRender((value) => value + 1)
  }, [canRedoBaselineEdit, commitBaselineEditorSnapshot])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isEditable || !(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        handleUndo()
        return
      }
      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault()
        handleRedo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleRedo, handleUndo, isEditable])

  const metrics = (
    <>
      <MetricCard
        eyebrow="DIVISION"
        title="分部工程"
        value={activeBaseline?.summary?.division_items ?? 0}
        hint={`下级计划 ${activeBaseline?.summary?.total_items ?? 0} 项`}
        tone="primary"
        icon={<ListTree className="h-4 w-4" />}
      />
      <MetricCard
        eyebrow="SUBDIVISION"
        title="分项工程"
        value={activeBaseline?.summary?.subdivision_items ?? 0}
        hint={`施工任务 ${activeBaseline?.summary?.construction_task_items ?? 0}`}
        tone="success"
        icon={<GitBranch className="h-4 w-4" />}
      />
      <MetricCard
        eyebrow="TASK"
        title="施工任务"
        value={activeBaseline?.summary?.construction_task_items ?? 0}
        hint="总进度计划条目"
        tone="info"
        icon={<CalendarDays className="h-4 w-4" />}
      />
      <MetricCard
        eyebrow="MILESTONE"
        title="里程碑"
        value={activeBaseline?.summary?.milestone_items ?? 0}
        hint="用于总进度控制节点"
        tone="slate"
        icon={<Milestone className="h-4 w-4" />}
      />
    </>
  )

  const actionBar = (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="baseline-open-version-records"
        onClick={() => setRecordsOpen(true)}
      >
        查看版本记录
      </Button>
      <Button
        type="button"
        size="sm"
        data-testid="baseline-generate-draft"
        loading={generating}
        disabled={isEditable}
        title={isEditable ? '请先保存或取消当前编辑' : '生成新版项目基线草稿'}
        onClick={handleGenerateVersion}
      >
        生成新版基线
      </Button>
      {activeBaseline && canEditActiveBaseline ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="baseline-publish"
          disabled={isEditable}
          title={isEditable ? '请先保存或取消当前编辑' : '发布已保存的项目基线草稿'}
          onClick={() => {
            setPublishCauseCode(inferBaselinePublishCauseCode(activeBaseline))
            setPublishChangeReason('')
            setPublishOpen(true)
          }}
        >
          发布项目基线
        </Button>
      ) : null}
    </>
  )

  // v1.4.7.1: BaselineVersionBar replaces static infoBar with action buttons
  const infoBar = (
    <BaselineVersionBar
      versionLabel={`${getVersionLabel(activeBaseline ?? currentVersion)} ${getStatusLabel(activeBaseline ?? currentVersion)}`}
      confirmedAt={activeBaseline?.confirmed_at ?? activeBaseline?.updated_at ?? null}
      planStartDate={toDateOnly(planRange.start)}
      planEndDate={toDateOnly(planRange.end)}
      totalDurationDays={getDurationDays(planRange.start, planRange.end)}
      isDraft={!activeBaseline?.confirmed_at}
      onCompareWithCurrent={activeBaseline ? handleOpenCurrentDiff : undefined}
      onViewHistory={() => setRecordsOpen(true)}
    />
  )

  const baselineTreeRows = useMemo<PlanningTreeRow[]>(() => {
    const childParentIds = new Set(items.map((item) => item.parent_item_id).filter((id): id is string => Boolean(id)))
    const childCountByParentId = new Map<string, number>()
    for (const item of items) {
      if (!item.parent_item_id) continue
      childCountByParentId.set(item.parent_item_id, (childCountByParentId.get(item.parent_item_id) ?? 0) + 1)
    }

    return rows.map((row) => {
      const titleIssue = getFirstCellIssue(baselineValidationCellMap, row.id, 'title')
      const startIssue = getFirstCellIssue(baselineValidationCellMap, row.id, 'start')
      const endIssue = getFirstCellIssue(baselineValidationCellMap, row.id, 'end')

      return {
        id: row.id,
        title: row.title,
        subtitle: row.notes ?? undefined,
        depth: row.depth + 1,
        sequenceLabel: row.wbsLabel,
        wbsCode: row.wbsLabel,
        engineeringCategoryId: row.engineering_category_id ?? null,
        engineeringCategoryType: row.engineering_category_type ?? null,
        wbsNodeType: row.wbs_node_type ?? row.engineering_category_type ?? null,
        isExecutable: row.is_executable ?? null,
        rowType: getBaselineRowType(row, childParentIds),
        selected: normalizedSelectedItemIds.includes(row.id),
        locked: !isEditable,
        isPersisted: !String(row.id).startsWith('local-'),
        isNew: String(row.id).startsWith('local-'),
        childCount: childCountByParentId.get(row.id) ?? 0,
        isMilestone: Boolean(row.is_milestone),
        isCritical: Boolean(row.is_critical ?? row.is_baseline_critical),
        startDateLabel: toDateOnly(row.planned_start_date),
        endDateLabel: toDateOnly(row.planned_end_date),
        durationLabel: getDurationDays(row.planned_start_date, row.planned_end_date),
        durationSuggestionQuery: isEditable && projectId
          ? {
            projectId,
            engineeringCategoryId: row.engineering_category_id ?? null,
            wbsNodeType: row.wbs_node_type ?? row.engineering_category_type ?? null,
            standardWorkCode: row.standard_work_code ?? null,
            taskTitle: row.title,
            plannedStartDate: row.planned_start_date ?? null,
            plannedEndDate: row.planned_end_date ?? null,
          }
          : null,
        extra: row.standard_work_code ? (
          <Badge variant="outline" className="px-1.5 py-0 text-xs text-slate-600">
            {row.standard_work_code}
          </Badge>
        ) : null,
        titleCell: isEditable ? (
          <div className="space-y-1">
            <Input
              data-baseline-editor-cell={`${row.id}:title`}
              value={row.title}
              aria-invalid={Boolean(titleIssue)}
              aria-describedby={titleIssue ? `baseline-validation-${row.id}-title` : undefined}
              onChange={(event) => updateItemField(row.id, 'title', event.target.value)}
              className={cn(
                'h-9 border-slate-200 bg-white text-sm text-slate-900',
                row.depth === 0 && 'font-semibold',
                row.depth >= 2 && 'font-normal',
                titleIssue && 'border-red-500 ring-1 ring-red-200',
              )}
            />
            {titleIssue ? (
              <p id={`baseline-validation-${row.id}-title`} role="alert" className="text-xs text-red-600">
                {titleIssue.message}
              </p>
            ) : null}
          </div>
        ) : undefined,
        startCell: isEditable ? (
          <div className="space-y-1">
            <Input
              type="date"
              data-baseline-editor-cell={`${row.id}:start`}
              value={toDateInputValue(row.planned_start_date)}
              aria-invalid={Boolean(startIssue)}
              aria-describedby={startIssue ? `baseline-validation-${row.id}-start` : undefined}
              onChange={(event) => updateItemField(row.id, 'planned_start_date', event.target.value)}
              className={cn(
                'h-9 border-slate-200 bg-white text-sm text-slate-700',
                startIssue && 'border-red-500 ring-1 ring-red-200',
              )}
            />
            {startIssue ? (
              <p id={`baseline-validation-${row.id}-start`} role="alert" className="text-xs text-red-600">
                {startIssue.message}
              </p>
            ) : null}
          </div>
        ) : undefined,
        endCell: isEditable ? (
          <div className="space-y-1">
            <Input
              type="date"
              data-baseline-editor-cell={`${row.id}:end`}
              value={toDateInputValue(row.planned_end_date)}
              aria-invalid={Boolean(endIssue)}
              aria-describedby={endIssue ? `baseline-validation-${row.id}-end` : undefined}
              onChange={(event) => updateItemField(row.id, 'planned_end_date', event.target.value)}
              className={cn(
                'h-9 border-slate-200 bg-white text-sm text-slate-700',
                endIssue && 'border-red-500 ring-1 ring-red-200',
              )}
            />
            {endIssue ? (
              <p id={`baseline-validation-${row.id}-end`} role="alert" className="text-xs text-red-600">
                {endIssue.message}
              </p>
            ) : null}
          </div>
        ) : undefined,
        onAddSibling: isEditable ? () => createLocalItem(row.parent_item_id ?? null, '新同级', row) : undefined,
        onAddChild: isEditable ? () => createLocalItem(row.id, '新子级', row) : undefined,
        onSmartExpand: isEditable ? () => setInlineTemplateGenerateItemId((current) => (current === row.id ? null : row.id)) : undefined,
        onToggleMilestone: isEditable ? () => toggleMilestone(row.id) : undefined,
        onPromote: isEditable ? () => promoteItem(row.id) : undefined,
        onDemote: isEditable ? () => demoteItem(row.id) : undefined,
        onMoveUp: isEditable ? () => moveItem(row.id, -1) : undefined,
        onMoveDown: isEditable ? () => moveItem(row.id, 1) : undefined,
        onDelete: isEditable ? () => deleteLocalItem(row.id) : undefined,
        inlinePanel: inlineTemplateGenerateItemId === row.id ? (
          <WbsTemplateGenerateInlinePanel
            projectId={projectId}
            surface="baseline"
            defaultPlannedStartDate={toDateInputValue(row.planned_start_date) || toDateInputValue(planRange.start) || new Date().toISOString().slice(0, 10)}
            defaultSortOrder={items.length}
            attachUnderRowId={row.id}
            onApply={handleApplyTemplateGeneratedBaseline}
            onCancel={() => setInlineTemplateGenerateItemId(null)}
          />
        ) : undefined,
      }
    })
  }, [
    baselineValidationCellMap,
    createLocalItem,
    deleteLocalItem,
    demoteItem,
    handleApplyTemplateGeneratedBaseline,
    inlineTemplateGenerateItemId,
    isEditable,
    items,
    moveItem,
    normalizedSelectedItemIds,
    planRange.start,
    promoteItem,
    projectId,
    rows,
    toggleMilestone,
    updateItemField,
  ])

  const handleExportBaseline = useCallback(async (scope: ExportScope, format: ExportFormat) => {
    const visibleExtraColumns = readPlanningFieldConfigExtraColumns(
      fieldConfigStorageKey,
      fieldRegistry.registry?.registryVersion,
    )
    const exportRows = buildBaselineExportData(rows, scope, visibleExtraColumns)
    const exportedColumnCount = getBaselineExportColumns(scope, visibleExtraColumns).length
    const date = new Date().toISOString().slice(0, 10)

    try {
      await writePlanningTableExport({
        fileNameBase: `${projectName || '项目'}_项目基线_${date}`,
        format,
        rows: exportRows,
        sheetName: '项目基线',
      })
      setStatusNotice(`已导出 ${rows.length} 行、${exportedColumnCount} 个字段。`)
    } catch (error) {
      setError(getApiErrorMessage(error, '导出项目基线失败，请稍后重试。'))
    }
  }, [fieldConfigStorageKey, fieldRegistry.registry?.registryVersion, projectName, rows])

  const generationCandidatePanel = generationCandidate && !isEditable ? (
    <section
      data-testid="baseline-generation-candidate"
      className="surface-card border-blue-100 bg-blue-50/70 px-5 py-4"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-blue-200 bg-white text-blue-700">
              系统建议
            </Badge>
            <span className="text-xs font-medium text-blue-700">
              {generationCandidate.sourceVersionLabel} → {generationCandidate.candidateVersionLabel}
            </span>
          </div>
          <h3 className="mt-2 text-base font-semibold text-slate-950">建议生成新版基线草案</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">{generationCandidate.summary}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="rounded-full bg-white px-3 py-1">
              差异 {generationCandidate.diffCounts.total ?? generationCandidate.diffItems.length} 处
            </span>
            <span className="rounded-full bg-white px-3 py-1">
              受影响 {Math.round(generationCandidate.metrics.affectedTaskRatio * 100)}%
            </span>
            <span className="rounded-full bg-white px-3 py-1">
              总完工偏移 {generationCandidate.metrics.totalFinishShiftDays} 天
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            loading={generating}
            data-testid="baseline-accept-generation-candidate"
            title="系统将基于当前任务列表和实际进度，自动生成新版基线草案，你可以复核后再发布。原基线不受影响，直到你发布新版。"
            onClick={handleGenerateVersion}
          >
            <Sparkles className="mr-1.5 h-4 w-4" />
            接受建议
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="baseline-dismiss-generation-candidate"
            onClick={() => {
              setDismissedCandidateBaselineId(generationCandidate.baselineId)
              setGenerationCandidate(null)
            }}
          >
            先不更新
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="baseline-view-generation-candidate"
            onClick={() => setCandidateDetailsOpen(true)}
          >
            <FileDiff className="mr-1.5 h-4 w-4" />
            查看详情
          </Button>
        </div>
      </div>
    </section>
  ) : null

  const table = (
    <div className="space-y-3">
      {generationCandidatePanel}
      <div className="surface-card flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">总进度计划</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">总进度计划表</h2>
          <p className="mt-2 text-sm text-slate-500">{rows.length} 项 · {isEditable ? '正在编辑计划表' : '只读查看'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="bg-white text-slate-600">
            {getStatusLabel(activeBaseline)}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="baseline-export-open"
            disabled={rows.length === 0}
            onClick={() => setExportOpen(true)}
          >
            导出
          </Button>
          {isEditable ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="baseline-template-generate"
                onClick={() => setTemplateGenerateOpen(true)}
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                从模板生成
              </Button>
              {activeBaseline ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="baseline-edit-compare-current"
                  onClick={handleOpenCurrentDiff}
                >
                  <FileDiff className="mr-1.5 h-4 w-4" />
                  对比当前生效版本
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={handleCancelEdit}>
                取消
              </Button>
              <Button type="button" variant="outline" size="sm" loading={publishing} onClick={handleSaveDraft}>
                保存
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canEditActiveBaseline}
              title={canEditActiveBaseline ? '编辑当前项目基线草稿' : '请先生成新版基线草稿后编辑'}
              onClick={handleStartEdit}
            >
              编辑
            </Button>
          )}
        </div>
      </div>

      <PlanningValidationStrip
        testId="baseline-validation-strip"
        issues={baselineValidation.issues}
        blockCount={baselineValidation.blockCount}
        confirmCount={baselineValidation.confirmCount}
        hintCount={baselineValidation.hintCount}
        onLocateIssue={focusPlanningValidationIssue}
      />
      <BaselineTreeEditor
        title="总进度计划表"
        treeTitle="总进度计划表"
        treeDescription=""
        treeEmptyLabel={loading ? '正在加载总进度计划...' : '暂无项目基线，可生成新版基线后开始维护。'}
        treeVariant="baseline"
        testId="baseline-tree-editor"
        rows={loading ? [] : baselineTreeRows}
        selectedCount={normalizedSelectedItemIds.length}
        readOnly={!isEditable}
        isDirty={isEditable}
        canUndo={canUndoBaselineEdit}
        canRedo={canRedoBaselineEdit}
        onToggleRow={handleToggleRow}
        onToggleAll={handleToggleAll}
        onPasteRows={handlePasteRows}
        onDeleteRows={deleteLocalItems}
        onFillRows={handleFillRows}
        onUpdateCells={handleUpdateCells}
        presence={baselinePresence}
        onActiveCellChange={baselinePresence.setEditingCell}
        onUndo={handleUndo}
        onRedo={handleRedo}
        viewMode={viewMode}
        rowMode={isEditable ? 'edit' : 'read'}
        onViewModeChange={setViewMode}
        onStartEdit={handleStartEdit}
        onCancelEdit={handleCancelEdit}
        onSave={handleSaveDraft}
        fieldRegistryFields={fieldRegistry.registry?.fields}
        fieldRegistryVersion={fieldRegistry.registry?.registryVersion}
        fieldConfigStorageKey={fieldConfigStorageKey}
      />
    </div>
  )

  return (
    <PlanningPageShell
      projectName={projectName}
      eyebrow="计划编制"
      title="项目基线"
      description="维护项目总进度计划，发布后作为现场执行和偏差分析依据。"
      frame="open"
      tabs={[]}
      metrics={metrics}
      actions={actionBar}
      breadcrumbItems={[
        { label: projectName },
        { label: '计划编制' },
        { label: '项目基线' },
      ]}
    >
      <div className="space-y-4">
        <PlanningPresenceContractAnchor presence={baselinePresence} onActiveCellChange={baselinePresence.setEditingCell} />
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {statusNotice ? (
          <Alert className="border-blue-100 bg-blue-50/70 text-blue-950">
            <AlertDescription>{statusNotice}</AlertDescription>
          </Alert>
        ) : null}
        <PlanningPageLayout
          summary={infoBar}
          main={table}
        />
      </div>

      <WbsTemplateGenerateDialog
        open={templateGenerateOpen}
        onOpenChange={setTemplateGenerateOpen}
        projectId={projectId}
        surface="baseline"
        defaultPlannedStartDate={toDateInputValue(planRange.start) || new Date().toISOString().slice(0, 10)}
        defaultSortOrder={items.length}
        onApply={handleApplyTemplateGeneratedBaseline}
      />

      <Dialog open={recordsOpen} onOpenChange={setRecordsOpen}>
        <DialogContent
          centered={false}
          data-testid="baseline-version-records-dialog"
          className="left-auto right-0 top-0 h-screen w-[min(100vw,720px)] max-w-none overflow-hidden rounded-none border-y-0 border-r-0 p-0 shadow-[var(--el-4)] sm:rounded-l-2xl"
        >
          <DialogHeader className="border-b border-slate-100 p-6 pb-4 pr-16">
            <div className="flex items-center gap-3">
              <FileClock className="h-5 w-5 text-blue-600" />
              <div>
                <DialogTitle className="text-2xl">版本记录</DialogTitle>
                <DialogDescription>项目基线版本、差异和发布留痕。</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="h-[calc(100vh-96px)] space-y-5 overflow-y-auto p-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="eyebrow">历史基线</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-950">历史基线</h3>
                </div>
                <Badge variant="outline" className="bg-white">
                  {versions.length} 个版本
                </Badge>
              </div>
              <div className="mt-4 space-y-3">
                {versions.map((version) => (
                  <div key={version.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                    <div>
                      <p className="font-semibold text-slate-950">{getVersionLabel(version)}</p>
                      <p className="text-sm text-slate-500">{toDateOnly(version.confirmed_at ?? version.updated_at ?? version.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {version.is_current_execution ? <Badge variant="secondary">当前生效</Badge> : null}
                      <Badge variant="outline" className="bg-white">{getStatusLabel(version)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="eyebrow">版本差异</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-950">版本差异</h3>
                </div>
                <Badge variant="outline" className="bg-white">自动汇总</Badge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-4 text-center">
                  <p className="text-sm text-slate-500">新增</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-950">0</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 text-center">
                  <p className="text-sm text-slate-500">删除</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-950">0</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 text-center">
                  <p className="text-sm text-slate-500">调整</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-950">0</p>
                </div>
              </div>
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                当前查看版本与上一发布版本暂无显著差异。
              </p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="eyebrow">发布留痕</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-950">发布留痕</h3>
                </div>
                <Badge variant="outline" className="bg-white">最近记录</Badge>
              </div>
              <div className="mt-4 space-y-3">
                {(versions.slice(0, 4).length > 0 ? versions.slice(0, 4) : [activeBaseline].filter(Boolean)).map((version) => (
                  <div key={version!.id} className="flex items-start gap-3 rounded-xl bg-slate-50 px-4 py-3">
                    <RefreshCw className="mt-0.5 h-4 w-4 text-slate-400" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {getVersionLabel(version)} {version?.status === 'confirmed' ? '已发布' : '已保存'}
                      </p>
                      <p className="text-sm text-slate-500">
                        {toDateOnly(version?.updated_at ?? version?.created_at)} · 系统记录本次总进度计划保存动作
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={candidateDetailsOpen} onOpenChange={setCandidateDetailsOpen}>
        <DialogContent
          data-testid="baseline-generation-candidate-dialog"
          className="max-h-[90vh] max-w-4xl overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>新版基线候选详情</DialogTitle>
            <DialogDescription>系统按当前任务列表预估的基线草案差异，仅用于复核，不会直接发布。</DialogDescription>
          </DialogHeader>
          {generationCandidate ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="text-xs text-slate-500">受影响计划行</div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">{generationCandidate.metrics.affectedTaskCount}</div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="text-xs text-slate-500">新增 / 移除</div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">
                    {generationCandidate.metrics.addedItemCount} / {generationCandidate.metrics.removedItemCount}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="text-xs text-slate-500">里程碑最大偏移</div>
                  <div className="mt-1 text-lg font-semibold text-slate-950">{generationCandidate.metrics.milestoneMaxShiftDays} 天</div>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-900">触发原因</h4>
                {generationCandidate.reasons.map((reason) => (
                  <div key={reason.code} className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3">
                    <div className="text-sm font-semibold text-blue-900">{reason.label}</div>
                    <div className="mt-1 text-sm text-blue-700">{reason.detail}</div>
                  </div>
                ))}
              </div>
              <BaselineDiffView
                fromVersionLabel={generationCandidate.sourceVersionLabel}
                toVersionLabel={generationCandidate.candidateVersionLabel}
                items={generationCandidate.diffItems}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <BaselineDiffDrawer
        open={diffOpen}
        onOpenChange={setDiffOpen}
        fromVersionLabel={diffFromVersionLabel}
        toVersionLabel={diffToVersionLabel}
        items={baselineDiffItems}
        loading={diffLoading}
        error={diffError}
        onLocateItem={handleLocateBaselineDiffItem}
      />

      <PlanningExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onExport={(scope, format) => {
          void handleExportBaseline(scope, format)
        }}
        projectName={projectName}
        pageName="项目基线"
      />

      <Dialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>发布项目基线</DialogTitle>
            <DialogDescription>发布后将成为新的当前生效项目基线。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              系统会先同步最新服务端数据并自动合并无关修改；如同一计划条目刚被他人更新，会提示确认后再继续。
            </p>
            <div className="space-y-2">
              <Label htmlFor="baseline-publish-cause-code">变更原因分类</Label>
              <Select
                value={publishCauseCode}
                onValueChange={(value) => setPublishCauseCode(value as BaselinePublishCauseCode)}
              >
                <SelectTrigger id="baseline-publish-cause-code" aria-label="变更原因分类">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="bottom" align="start">
                  {BASELINE_PUBLISH_CAUSE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="baseline-publish-change-reason">原因原话</Label>
              <Textarea
                id="baseline-publish-change-reason"
                value={publishChangeReason}
                onChange={(event) => setPublishChangeReason(event.target.value)}
                maxLength={4000}
                required
                aria-required="true"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPublishOpen(false)}>
                取消
              </Button>
              <Button
                type="button"
                loading={publishing}
                disabled={publishing || !publishChangeReason.trim()}
                title={!publishChangeReason.trim() ? '请填写原因原话' : '确认发布项目基线'}
                onClick={handlePublishBaseline}
              >
                确认发布
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PlanningPageShell>
  )
}
