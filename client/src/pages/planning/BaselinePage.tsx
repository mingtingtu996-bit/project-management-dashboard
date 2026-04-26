import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { ConfirmActionDialog } from '@/components/ConfirmActionDialog'
import { PlanningPageShell } from '@/components/planning/PlanningPageShell'
import type { PlanningTreeRow } from '@/components/planning/PlanningTreeView'
import { PlanningWorkspaceLayers } from '@/components/planning/PlanningWorkspaceLayers'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { LoadingState } from '@/components/ui/loading-state'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePlanningStore } from '@/hooks/usePlanningStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useStore } from '@/hooks/useStore'
import { useToast } from '@/hooks/use-toast'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import { apiGet, apiPost, getApiErrorMessage } from '@/lib/apiClient'
import type {
  BaselineItem,
  BaselineVersion,
  ObservationPoolReadResponse,
  PlanningDraftLockRecord,
  RevisionPoolCandidate,
} from '@/types/planning'
import { AlertTriangle, FileDiff, FileSpreadsheet, FolderGit2, History, LockKeyhole, FilePlus2, Calendar } from 'lucide-react'
import * as XLSX from 'xlsx'

import { BaselineBottomBar } from './components/BaselineBottomBar'
import { BaselineConfirmDialog, type BaselineConfirmState } from './components/BaselineConfirmDialog'
import { BaselineDiffView, type BaselineDiffItem } from './components/BaselineDiffView'
import { BaselineRevisionPoolDialog } from './components/BaselineRevisionPoolDialog'
import type { BaselineRevisionCandidate } from './components/BaselineRevisionCandidateList'
import { BaselineTreeEditor } from './components/BaselineTreeEditor'
import { BaselineValidationPanel } from './components/BaselineValidationPanel'
import { PlanningDraftResumeDialog } from './components/PlanningDraftResumeDialog'
import {
  buildPlanningDraftResumeKey,
  clearPlanningDraftResumeSnapshot,
  readPlanningDraftResumeSnapshot,
  writePlanningDraftResumeSnapshot,
  type PlanningDraftResumeSnapshot,
} from './draftPersistence'
import { extractApiErrorCode, getBaselineStatusLabel } from './planningShared'

type BaselineDetail = BaselineVersion & { items: BaselineItem[] }
type FilterMode = 'all' | 'mapping_attention' | 'critical' | 'milestone'
type BaselineAction = 'save' | 'confirm' | 'unlock' | 'queue_realign' | 'resolve_realign' | null
type EditableField = 'title' | 'start' | 'end' | 'progress'
type EditorSnapshot = { items: BaselineItem[]; selectedIds: string[] }
type ConfirmFailureContext = { code: string | null; message: string }
type BaselineImportPreviewRow = {
  id: string
  title: string
  planned_start_date: string | null
  planned_end_date: string | null
  target_progress: number | null
  notes: string | null
  is_milestone: boolean
  sort_order: number
}
type BaselineImportSourceRow = Record<string, unknown>
type BaselineImportFieldKey = 'title' | 'start' | 'end' | 'progress' | 'notes' | 'milestone'
type BaselineImportColumnMapping = Record<BaselineImportFieldKey, string>
type BaselineImportPreview = {
  fileName: string
  sheetName: string
  importedAt: string
  sourceRows: BaselineImportSourceRow[]
  columns: string[]
  mapping: BaselineImportColumnMapping
  rows: BaselineImportPreviewRow[]
  warnings: string[]
}

const BASELINE_EDITABLE_FIELDS: EditableField[] = ['title', 'start', 'end', 'progress']

const TABS = [
  { key: 'baseline', label: '项目基线' },
  { key: 'monthly', label: '月度计划' },
] as const

const BASELINE_IMPORT_FIELD_CONFIG: Array<{
  key: BaselineImportFieldKey
  label: string
  required: boolean
  hints: readonly string[]
}> = [
  {
    key: 'title',
    label: '任务名称',
    required: true,
    hints: ['任务名称', '标题', '名称', 'task_name', 'title', '任务', 'WBS名称'],
  },
  {
    key: 'start',
    label: '计划开始',
    required: true,
    hints: ['计划开始', '开始日期', 'planned_start_date', 'start_date', '开始'],
  },
  {
    key: 'end',
    label: '计划结束',
    required: true,
    hints: ['计划结束', '结束日期', 'planned_end_date', 'end_date', '结束'],
  },
  {
    key: 'progress',
    label: '目标进度',
    required: true,
    hints: ['目标进度', 'target_progress', '进度', 'progress', '目标进度(%)', '进度(%)'],
  },
  {
    key: 'notes',
    label: '备注',
    required: false,
    hints: ['备注', '说明', 'notes', 'description'],
  },
  {
    key: 'milestone',
    label: '是否里程碑',
    required: false,
    hints: ['是否里程碑', '里程碑', 'is_milestone', 'milestone'],
  },
] as const

function normalizeImportColumnName(value: string) {
  return value.trim().toLowerCase()
}

function getImportCell(row: BaselineImportSourceRow, columnName: string) {
  if (!columnName) return null
  const cell = row[columnName]
  if (cell === undefined || cell === null) return null
  const normalized = String(cell).trim()
  return normalized.length > 0 ? cell : null
}

function resolveImportColumn(columns: string[], hints: readonly string[]) {
  const normalizedColumns = columns.map((column) => ({ column, normalized: normalizeImportColumnName(column) }))
  for (const hint of hints) {
    const normalizedHint = normalizeImportColumnName(hint)
    const matched = normalizedColumns.find((column) => column.normalized === normalizedHint)
    if (matched) return matched.column
  }
  return ''
}

function resolveImportMapping(columns: string[]): BaselineImportColumnMapping {
  return BASELINE_IMPORT_FIELD_CONFIG.reduce((mapping, field) => {
    mapping[field.key] = resolveImportColumn(columns, field.hints)
    return mapping
  }, {} as BaselineImportColumnMapping)
}

function calculateImportMappingProgress(mapping: BaselineImportColumnMapping) {
  const mappedCount = BASELINE_IMPORT_FIELD_CONFIG.filter((field) => Boolean(mapping[field.key])).length
  return Math.round((mappedCount / BASELINE_IMPORT_FIELD_CONFIG.length) * 100)
}

function buildBaselineImportPreview(params: {
  fileName: string
  sheetName: string
  importedAt: string
  sourceRows: BaselineImportSourceRow[]
  columns: string[]
  mapping: BaselineImportColumnMapping
}): BaselineImportPreview {
  const warnings: string[] = []
  const missingRequiredMappings = BASELINE_IMPORT_FIELD_CONFIG.filter(
    (field) => field.required && !params.mapping[field.key],
  )

  if (missingRequiredMappings.length > 0) {
    warnings.push(`尚有必填列未映射：${missingRequiredMappings.map((field) => field.label).join(' / ')}。`)
  }

  const previewRows = params.sourceRows
    .map((row, index) => {
      const titleCell = getImportCell(row, params.mapping.title)
      const startCell = getImportCell(row, params.mapping.start)
      const endCell = getImportCell(row, params.mapping.end)
      const progressCell = getImportCell(row, params.mapping.progress)
      const notesCell = getImportCell(row, params.mapping.notes)
      const milestoneCell = getImportCell(row, params.mapping.milestone)

      const hasContent = [titleCell, startCell, endCell, progressCell, notesCell, milestoneCell].some((value) =>
        value != null && String(value).trim().length > 0,
      )
      if (!hasContent) return null

      const title = titleCell ? String(titleCell).trim() : `导入条目 ${index + 1}`
      if (!titleCell) {
        warnings.push(`第 ${index + 1} 行未找到标题字段，已自动命名为“${title}”。`)
      }

      const planned_start_date = normalizeImportDate(startCell)
      const planned_end_date = normalizeImportDate(endCell)
      const target_progress = normalizeImportProgress(progressCell)
      const notes = notesCell ? String(notesCell).trim() : null
      const is_milestone = normalizeImportMilestone(milestoneCell)

      return {
        id: `import-${index + 1}`,
        title,
        planned_start_date,
        planned_end_date,
        target_progress,
        notes,
        is_milestone,
        sort_order: index,
      } satisfies BaselineImportPreviewRow
    })
    .filter((row): row is BaselineImportPreviewRow => Boolean(row))

  if (previewRows.length === 0) {
    throw new Error('导入文件中没有可用的基线条目。')
  }

  return {
    fileName: params.fileName,
    sheetName: params.sheetName,
    importedAt: params.importedAt,
    sourceRows: params.sourceRows,
    columns: params.columns,
    mapping: params.mapping,
    rows: previewRows,
    warnings,
  }
}

function normalizeImportDate(value: unknown) {
  if (value == null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return XLSX.SSF.format('yyyy-mm-dd', value)
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const normalized = String(value).trim()
  if (!normalized) return null
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? normalized : parsed.toISOString().slice(0, 10)
}

function normalizeImportProgress(value: unknown) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function normalizeImportMilestone(value: unknown) {
  if (typeof value === 'boolean') return value
  const normalized = String(value ?? '').trim().toLowerCase()
  return ['1', 'true', 'yes', 'y', '是', '里程碑'].includes(normalized)
}

async function parseBaselineImportFile(file: File): Promise<BaselineImportPreview> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<BaselineImportSourceRow>(sheet, { defval: null })
  const sourceRows = rows.filter((row) =>
    Object.values(row).some((value) => String(value ?? '').trim().length > 0),
  )
  const columns = Array.from(new Set(sourceRows.flatMap((row) => Object.keys(row))))
  const mapping = resolveImportMapping(columns)

  return buildBaselineImportPreview({
    fileName: file.name,
    sheetName,
    importedAt: new Date().toISOString(),
    sourceRows,
    columns,
    mapping,
  })
}

function sameIdSequence(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function cloneItems(items: BaselineItem[]) {
  return items.map((item) => ({ ...item }))
}

function serializeItems(items: BaselineItem[]) {
  return items
    .map((item) =>
      [
        item.id,
        item.title,
        item.planned_start_date ?? '',
        item.planned_end_date ?? '',
        item.target_progress ?? '',
        item.mapping_status ?? '',
      ].join('|'),
    )
    .join('||')
}

function serializeSnapshot(snapshot: EditorSnapshot) {
  return `${serializeItems(snapshot.items)}###${snapshot.selectedIds.join('|')}`
}

function normalizeSelectedIds(ids: string[], allIds: string[]) {
  const allow = new Set(allIds)
  return ids.filter((id) => allow.has(id))
}

function shiftDateValue(value: string | null | undefined, days: number) {
  if (!value) return value ?? null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function formatStatusLabel(status: BaselineVersion['status']) {
  return getBaselineStatusLabel(status)
}

function mapRevisionPoolCandidate(candidate: RevisionPoolCandidate): BaselineRevisionCandidate {
  const sourceTypeLabel =
    candidate.source_type === 'observation'
      ? '观测'
      : candidate.source_type === 'deviation'
        ? '偏差'
        : '手动'
  const sourceLabel =
    candidate.source_type === 'observation'
      ? '来自观测池'
      : candidate.source_type === 'deviation'
        ? '来自偏差分析'
        : '人工补录'
  const windowLabel = [candidate.observation_window_start, candidate.observation_window_end]
    .filter(Boolean)
    .join(' → ')

  return {
    ...candidate,
    summary: candidate.reason,
    source: windowLabel ? `${sourceLabel} · ${windowLabel}` : sourceLabel,
    tag: sourceTypeLabel,
  }
}

function buildBaselineStatusNotice(status: BaselineVersion['status'], compareLabel: string) {
  switch (status) {
    case 'draft':
      return compareLabel === '无版本' ? '当前草稿已进入编制态。' : `当前草稿基于 ${compareLabel} 继续整理`
    case 'confirmed':
      return '当前展示的是已确认版本。'
    case 'revising':
      return '当前版本处于修订中，可继续整理差异并决定是否进入主动重排。'
    case 'pending_realign':
      return '当前版本已进入待重排态，处理完成后请执行“结束重排”恢复确认状态。'
    case 'archived':
      return '当前版本已归档，仅用于回溯对比和历史留痕。'
    case 'closed':
      return '当前版本已关闭，仅保留查看与留痕能力。'
    default:
      return '当前版本状态已更新。'
  }
}

function getConfirmState(search: string): BaselineConfirmState {
  const params = new URLSearchParams(search)
  const state = params.get('confirm_state')
  if (state === 'stale' || state === 'failed') return state
  return 'ready'
}

function getCompareKey(item: BaselineItem) {
  return item.source_task_id?.trim() || item.source_milestone_id?.trim() || item.title.trim()
}

function describeBaselineItem(item: BaselineItem | null | undefined) {
  if (!item) return '无对应条目'
  const dates = [item.planned_start_date ?? '未设开始', item.planned_end_date ?? '未设结束'].join(' → ')
  const progress = item.target_progress == null ? '未设目标进度' : `目标 ${item.target_progress}%`
  return `${item.title} / ${dates} / ${progress}`
}

function buildDepthMap(items: BaselineItem[]) {
  const byId = new Map(items.map((item) => [item.id, item]))
  const cache = new Map<string, number>()

  const resolve = (item: BaselineItem): number => {
    if (cache.has(item.id)) return cache.get(item.id) ?? 1
    if (!item.parent_item_id || !byId.has(item.parent_item_id)) {
      cache.set(item.id, 1)
      return 1
    }

    const parent = byId.get(item.parent_item_id)
    if (!parent) {
      cache.set(item.id, 1)
      return 1
    }

    const depth = Math.min(5, resolve(parent) + 1)
    cache.set(item.id, depth)
    return depth
  }

  items.forEach((item) => resolve(item))
  return cache
}

function buildDiffItems(previousItems: BaselineItem[], currentItems: BaselineItem[]): BaselineDiffItem[] {
  const previousByKey = new Map(previousItems.map((item) => [getCompareKey(item), item]))
  const nextByKey = new Map(currentItems.map((item) => [getCompareKey(item), item]))
  const items: BaselineDiffItem[] = []

  for (const current of currentItems) {
    const key = getCompareKey(current)
    const previous = previousByKey.get(key)

    if (!previous) {
      items.push({
        id: `add:${current.id}`,
        kind: '新增',
        title: current.title,
        before: '上一版本无此条目',
        after: describeBaselineItem(current),
      })
      continue
    }

    const milestoneChanged =
      Boolean(current.is_milestone || previous.is_milestone) &&
      previous.planned_end_date !== current.planned_end_date
    const changed =
      previous.title !== current.title ||
      previous.planned_start_date !== current.planned_start_date ||
      previous.planned_end_date !== current.planned_end_date ||
      previous.target_progress !== current.target_progress ||
      previous.mapping_status !== current.mapping_status

    if (!changed) continue

    items.push({
      id: `${milestoneChanged ? 'milestone' : 'change'}:${current.id}`,
      kind: milestoneChanged ? '里程碑变动' : '修改',
      title: current.title,
      before: describeBaselineItem(previous),
      after: describeBaselineItem(current),
      note: milestoneChanged ? '关键节点日期发生变化。' : undefined,
    })
  }

  for (const previous of previousItems) {
    const key = getCompareKey(previous)
    if (nextByKey.has(key)) continue
    items.push({
      id: `remove:${previous.id}`,
      kind: '移除',
      title: previous.title,
      before: describeBaselineItem(previous),
      after: '当前版本已不再包含此条目',
    })
  }

  return items
}

function formatVersionLabel(version?: number | null) {
  return version ? `v${version}` : '无版本'
}

function getLockLabel(lock: PlanningDraftLockRecord | null, readOnly: boolean) {
  if (readOnly || !lock?.is_locked) return '未持有编辑锁'
  return '已持有编辑锁'
}

function buildSavePayload(
  projectId: string,
  baseline: BaselineDetail,
  editorItems: BaselineItem[],
  selectedIds: string[],
) {
  const selected = new Set(selectedIds)
  return {
    project_id: projectId,
    title: baseline.title,
    description: baseline.description ?? null,
    source_type: 'manual' as const,
    source_version_id: baseline.id,
    source_version_label: formatVersionLabel(baseline.version),
    items: editorItems
      .filter((item) => selected.has(item.id))
      .map((item) => ({
        parent_item_id: item.parent_item_id ?? null,
        source_task_id: item.source_task_id ?? null,
        source_milestone_id: item.source_milestone_id ?? null,
        template_id: item.template_id ?? null,
        template_node_id: item.template_node_id ?? null,
        title: item.title,
        planned_start_date: item.planned_start_date ?? null,
        planned_end_date: item.planned_end_date ?? null,
        target_progress: item.target_progress ?? null,
        sort_order: item.sort_order,
        is_milestone: Boolean(item.is_milestone),
        is_critical: Boolean(item.is_critical),
        mapping_status: item.mapping_status ?? 'mapped',
        notes: item.notes ?? null,
      })),
  }
}

export default function BaselinePage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { toast } = useToast()
  const currentProject = useStore((state) => state.currentProject)
  const { canEdit, globalRole, permissionLevel } = usePermissions({ projectId: currentProject?.id ?? id })
  const changeLogs = useStore((state) => state.changeLogs)
  const changeLogsStatus = useStore((state) => state.sharedSliceStatus.changeLogs)
  const selectedItemIds = usePlanningStore((state) => state.selectedItemIds)
  const setSelectedItemIds = usePlanningStore((state) => state.setSelectedItemIds)
  const setActiveWorkspace = usePlanningStore((state) => state.setActiveWorkspace)
  const setDraftStatus = usePlanningStore((state) => state.setDraftStatus)
  const clearSelection = usePlanningStore((state) => state.clearSelection)
  const validationIssues = usePlanningStore((state) => state.validationIssues)

  const projectId = id ?? currentProject?.id ?? ''
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<BaselineAction>(null)
  const [versions, setVersions] = useState<BaselineVersion[]>([])
  const [activeBaseline, setActiveBaseline] = useState<BaselineDetail | null>(null)
  const [compareBaseline, setCompareBaseline] = useState<BaselineDetail | null>(null)
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null)
  const [editorItems, setEditorItems] = useState<BaselineItem[]>([])
  const [inputDrafts, setInputDrafts] = useState<Record<string, string>>({})
  const [draftLock, setDraftLock] = useState<PlanningDraftLockRecord | null>(null)
  const [internalReadOnly, setInternalReadOnly] = useState(false)
  const [statusNotice, setStatusNotice] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmFailure, setConfirmFailure] = useState<ConfirmFailureContext | null>(null)
  const [revisionPoolOpen, setRevisionPoolOpen] = useState(false)
  const [revisionBasketIds, setRevisionBasketIds] = useState<string[]>([])
  const [revisionActiveCandidateId, setRevisionActiveCandidateId] = useState<string | null>(null)
  const [revisionDeferredCandidateIds, setRevisionDeferredCandidateIds] = useState<string[]>([])
  const [revisionDeferredReason, setRevisionDeferredReason] = useState('')
  const [revisionDeferredReasonVisible, setRevisionDeferredReasonVisible] = useState(false)
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false)
  const [resumeSnapshot, setResumeSnapshot] = useState<PlanningDraftResumeSnapshot | null>(null)
  const [resumeInitialized, setResumeInitialized] = useState(false)
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [showValidationPanel, setShowValidationPanel] = useState(true)
  const [importPreview, setImportPreview] = useState<BaselineImportPreview | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importParsing, setImportParsing] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importMappingConfirmed, setImportMappingConfirmed] = useState(false)
  const [batchShiftDays, setBatchShiftDays] = useState('1')
  const [batchProgressValue, setBatchProgressValue] = useState('')
  const [revisionDeferredReviewDueAt, setRevisionDeferredReviewDueAt] = useState('')
  const [revisionPoolData, setRevisionPoolData] = useState<ObservationPoolReadResponse | null>(null)
  const [revisionPoolError, setRevisionPoolError] = useState<string | null>(null)
  const [, forceHistoryRender] = useState(0)

  const historyRef = useRef<EditorSnapshot[]>([])
  const historyCursorRef = useRef(-1)
  const rowsRef = useRef<PlanningTreeRow[]>([])
  const compareVersionPreferenceRef = useRef<string | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const baselineDraftResumeKey = useMemo(
    () => buildPlanningDraftResumeKey('baseline', projectId || 'none'),
    [projectId],
  )

  const allRowIds = useMemo(() => editorItems.map((item) => item.id), [editorItems])
  const normalizedSelectedItemIds = useMemo(
    () => normalizeSelectedIds(selectedItemIds, allRowIds),
    [allRowIds, selectedItemIds],
  )

  const compareLabel = formatVersionLabel(compareBaseline?.version)
  const currentLabel = formatVersionLabel(activeBaseline?.version)
  const readOnly = internalReadOnly || !canEdit
  const lockRemainingLabel = getLockLabel(draftLock, readOnly)
  const validityLabel = activeBaseline?.status === 'pending_realign' ? '待重定' : '有效'
  const validityHint =
    activeBaseline?.status === 'pending_realign'
      ? '已触发待重定阈值，请先整理修订候选或完成重排。'
      : '当前未触发待重定阈值，可继续沿当前口径维护基线。'
  const confirmState = confirmFailure ? 'failed' : getConfirmState(location.search)
  const confirmDisabledReason = validationIssues.some((issue) => issue.level === 'error')
    ? '当前存在阻断项，修正后才能确认发布。'
    : null
  const canManageBaselineActions = permissionLevel === 'owner' || globalRole === 'company_admin'
  const canQueueRealignment =
    canManageBaselineActions && (activeBaseline?.status === 'confirmed' || activeBaseline?.status === 'revising')
  const canResolveRealignment = canManageBaselineActions && activeBaseline?.status === 'pending_realign'
  const canForceUnlock = canManageBaselineActions && activeBaseline?.status === 'draft'
  const baselineChangeLogs = useMemo(
    () =>
      changeLogs
        .filter((record) => {
          if (record.entity_type !== 'baseline') return false
          if (!activeBaseline) return true
          return record.entity_id === activeBaseline.id || record.entity_id === compareBaseline?.id
        })
        .slice(0, 4),
    [activeBaseline, changeLogs, compareBaseline?.id],
  )

  const applySnapshot = useCallback((snapshot: EditorSnapshot) => {
    setEditorItems(cloneItems(snapshot.items))
    setSelectedItemIds(snapshot.selectedIds)
    setInputDrafts({})
    forceHistoryRender((value) => value + 1)
  }, [setSelectedItemIds])

  const resetHistory = useCallback((items: BaselineItem[], selectedIds: string[]) => {
    const snapshot = { items: cloneItems(items), selectedIds: [...selectedIds] }
    historyRef.current = [snapshot]
    historyCursorRef.current = 0
    applySnapshot(snapshot)
  }, [applySnapshot])

  const commitSnapshot = useCallback((items: BaselineItem[], selectedIds: string[], options?: { recordHistory?: boolean }) => {
    const snapshot = {
      items: cloneItems(items),
      selectedIds: normalizeSelectedIds(selectedIds, items.map((item) => item.id)),
    }

    if (options?.recordHistory === false) {
      applySnapshot(snapshot)
      return
    }

    const current = historyRef.current[historyCursorRef.current]
    if (current && serializeSnapshot(current) === serializeSnapshot(snapshot)) {
      applySnapshot(snapshot)
      return
    }

    const nextHistory = [...historyRef.current.slice(0, historyCursorRef.current + 1), snapshot]
    historyRef.current = nextHistory.slice(-60)
    historyCursorRef.current = historyRef.current.length - 1
    applySnapshot(snapshot)
  }, [applySnapshot])

  const loadBaselineContext = useCallback(async (options?: { preferredId?: string; preferredCompareId?: string | null; signal?: AbortSignal }) => {
    if (!projectId) return

    setLoading(true)
    setError(null)

    const signal = options?.signal
    const preferredId = options?.preferredId
    const preferredCompareId = options?.preferredCompareId

    try {
      const nextVersions = await apiGet<BaselineVersion[]>(`/api/task-baselines?project_id=${projectId}`, { signal })
      const sorted = [...nextVersions].sort((left, right) => right.version - left.version)
      setVersions(sorted)
      const resumeTargetId = preferredId
        ? null
        : readPlanningDraftResumeSnapshot(baselineDraftResumeKey)?.resourceId ?? null

      const targetVersion = sorted.find((item) => item.id === preferredId)
        ?? sorted.find((item) => item.id === resumeTargetId && item.status === 'draft')
        ?? sorted.find((item) => item.status === 'confirmed')
        ?? sorted.find((item) => item.status === 'draft')
        ?? sorted[0]

      if (!targetVersion) {
        setActiveBaseline(null)
        setCompareBaseline(null)
        setEditorItems([])
        setInternalReadOnly(true)
        setDraftLock(null)
        setDraftStatus('locked')
        clearSelection()
        setStatusNotice('当前项目还没有基线版本。')
        return
      }

      const requestedCompareId =
        preferredCompareId === undefined ? compareVersionPreferenceRef.current : preferredCompareId
      const compareVersion = (
        requestedCompareId
          ? sorted.find((item) => item.id === requestedCompareId && item.id !== targetVersion.id)
          : null
      )
        ?? sorted.find((item) => item.status === 'confirmed' && item.id !== targetVersion.id)
        ?? sorted.find((item) => item.id !== targetVersion.id)
        ?? null
      const [nextActive, nextCompare] = await Promise.all([
        apiGet<BaselineDetail>(`/api/task-baselines/${targetVersion.id}?project_id=${encodeURIComponent(projectId)}`, { signal }),
        compareVersion
          ? apiGet<BaselineDetail>(`/api/task-baselines/${compareVersion.id}?project_id=${encodeURIComponent(projectId)}`, {
              signal,
            })
          : Promise.resolve(null),
      ])

      setActiveBaseline(nextActive)
      setCompareBaseline(nextCompare)
      compareVersionPreferenceRef.current = nextCompare?.id ?? null
      setCompareVersionId(nextCompare?.id ?? null)
      resetHistory(nextActive.items ?? [], (nextActive.items ?? []).map((item) => item.id))
      setResumeInitialized(true)

      if (nextActive.status === 'draft') {
        const snapshot = readPlanningDraftResumeSnapshot(baselineDraftResumeKey)
        if (snapshot?.resourceId === nextActive.id) {
          setResumeSnapshot(snapshot)
          setResumeDialogOpen(true)
        } else {
          setResumeSnapshot(null)
          setResumeDialogOpen(false)
        }

        try {
          const response = await apiPost<{ lock: PlanningDraftLockRecord }>(`/api/task-baselines/${nextActive.id}/lock`, undefined, { signal })
          setDraftLock(response.lock)
          setInternalReadOnly(false)
          setDraftStatus('editing')
          setStatusNotice(buildBaselineStatusNotice(nextActive.status, formatVersionLabel(nextCompare?.version)))
        } catch (lockError) {
          if (signal?.aborted) return
          setDraftLock(null)
          setInternalReadOnly(true)
          setDraftStatus('locked')
          setStatusNotice(getApiErrorMessage(lockError, '当前草稿暂时无法获取编辑锁，已切换为只读查看。'))
        }
      } else {
        setDraftLock(null)
        setInternalReadOnly(true)
        setDraftStatus('locked')
        setResumeSnapshot(null)
        setResumeDialogOpen(false)
        setStatusNotice(buildBaselineStatusNotice(nextActive.status, formatVersionLabel(nextCompare?.version)))
      }
    } catch (loadError) {
      if (signal?.aborted) return
      setError(getApiErrorMessage(loadError, '加载基线版本失败，请稍后重试。'))
    } finally {
      setLoading(false)
    }
  }, [baselineDraftResumeKey, clearSelection, projectId, resetHistory, setDraftStatus])

  useEffect(() => {
    setActiveWorkspace('baseline')
  }, [setActiveWorkspace])

  useEffect(() => {
    const controller = new AbortController()
    void loadBaselineContext({ signal: controller.signal })
    return () => { controller.abort() }
  }, [loadBaselineContext])

  useEffect(() => {
    if (!allRowIds.length) return
    if (!sameIdSequence(normalizedSelectedItemIds, selectedItemIds)) {
      setSelectedItemIds(normalizedSelectedItemIds)
    }
  }, [allRowIds.length, normalizedSelectedItemIds, selectedItemIds, setSelectedItemIds])

  useEffect(() => {
    if (!resumeInitialized || loading) return

    if (!projectId) {
      clearPlanningDraftResumeSnapshot(baselineDraftResumeKey)
      return
    }

    if (!activeBaseline) return

    if (activeBaseline.status !== 'draft') {
      return
    }

    if (readOnly) {
      clearPlanningDraftResumeSnapshot(baselineDraftResumeKey)
      return
    }

    writePlanningDraftResumeSnapshot(baselineDraftResumeKey, {
      resourceId: activeBaseline.id,
      versionLabel: `v${activeBaseline.version}`,
      updatedAt: activeBaseline.updated_at ?? new Date().toISOString(),
      workspaceLabel: '项目基线',
    })
  }, [activeBaseline, baselineDraftResumeKey, loading, projectId, readOnly, resumeInitialized])

  useEffect(() => {
    if (!activeBaseline?.id) {
      setRevisionPoolData(null)
      setRevisionPoolError(null)
      return
    }

    const controller = new AbortController()
    let cancelled = false

    setRevisionPoolData(null)
    setRevisionPoolError(null)

    void apiGet<ObservationPoolReadResponse>(`/api/task-baselines/${activeBaseline.id}/revision-pool`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (cancelled || controller.signal.aborted) return
        setRevisionPoolData(data)
      })
      .catch((error) => {
        if (cancelled || controller.signal.aborted) return
        setRevisionPoolData(null)
        setRevisionPoolError(getApiErrorMessage(error, '修订观察池加载失败，当前展示本地候选。'))
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [activeBaseline?.id])

  const handleDraftChange = useCallback((itemId: string, field: EditableField, value: string) => {
    setInputDrafts((current) => ({ ...current, [`${itemId}:${field}`]: value }))
  }, [])

  const commitFieldEdit = useCallback((itemId: string, field: EditableField) => {
    const draftKey = `${itemId}:${field}`
    const draftValue = inputDrafts[draftKey]
    if (draftValue == null) return

    const nextItems = editorItems.map((item) => {
      if (item.id !== itemId) return item

      if (field === 'title') {
        const nextTitle = draftValue.trim()
        return { ...item, title: nextTitle || item.title }
      }
      if (field === 'start') {
        return { ...item, planned_start_date: draftValue || null }
      }
      if (field === 'end') {
        return { ...item, planned_end_date: draftValue || null }
      }

      const parsed = Number.parseInt(draftValue, 10)
      return { ...item, target_progress: Number.isNaN(parsed) ? null : Math.max(0, Math.min(100, parsed)) }
    })

    setInputDrafts((current) => {
      const next = { ...current }
      delete next[draftKey]
      return next
    })
    commitSnapshot(nextItems, normalizedSelectedItemIds)
  }, [commitSnapshot, editorItems, inputDrafts, normalizedSelectedItemIds])

  const handleInputKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>, itemId: string, field: EditableField) => {
    const draftKey = `${itemId}:${field}`
    const visibleRowIds = rowsRef.current
      .map((row) => row.id)
      .filter((rowId) => allRowIds.includes(rowId))
    const focusOrder = visibleRowIds.flatMap((rowId) =>
      BASELINE_EDITABLE_FIELDS.map((currentField) => ({ rowId, field: currentField })),
    )
    const currentIndex = focusOrder.findIndex((entry) => entry.rowId === itemId && entry.field === field)
    const focusTarget = (index: number) => {
      const target = focusOrder[index]
      if (!target) return
      requestAnimationFrame(() => {
        const nextCell = document.querySelector<HTMLInputElement>(
          `[data-baseline-editor-cell="${target.rowId}:${target.field}"]`,
        )
        nextCell?.focus()
        nextCell?.select?.()
      })
    }

    if (event.key === 'Tab') {
      const targetIndex = event.shiftKey ? currentIndex - 1 : currentIndex + 1
      commitFieldEdit(itemId, field)
      if (targetIndex >= 0 && targetIndex < focusOrder.length) {
        event.preventDefault()
        focusTarget(targetIndex)
      }
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      commitFieldEdit(itemId, field)
      event.currentTarget.blur()
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setInputDrafts((current) => {
        const next = { ...current }
        delete next[draftKey]
        return next
      })
      event.currentTarget.blur()
    }
  }, [allRowIds, commitFieldEdit])

  const handleToggleRow = useCallback((rowId: string) => {
    if (readOnly) return
    const nextIds = normalizedSelectedItemIds.includes(rowId)
      ? normalizedSelectedItemIds.filter((id) => id !== rowId)
      : [...normalizedSelectedItemIds, rowId]
    commitSnapshot(editorItems, nextIds)
  }, [commitSnapshot, editorItems, normalizedSelectedItemIds, readOnly])

  const handleToggleAll = useCallback((checked: boolean) => {
    if (readOnly) return
    const visibleIds = rowsRef.current.map((row) => row.id)
    const nextIds = checked
      ? Array.from(new Set([...normalizedSelectedItemIds, ...visibleIds]))
      : normalizedSelectedItemIds.filter((id) => !visibleIds.includes(id))
    commitSnapshot(editorItems, nextIds)
  }, [commitSnapshot, editorItems, normalizedSelectedItemIds, readOnly])

  const handleUndo = useCallback(() => {
    if (readOnly || historyCursorRef.current <= 0) return
    historyCursorRef.current -= 1
    const snapshot = historyRef.current[historyCursorRef.current]
    if (snapshot) {
      applySnapshot(snapshot)
    }
  }, [applySnapshot, readOnly])

  const handleRedo = useCallback(() => {
    if (readOnly || historyCursorRef.current >= historyRef.current.length - 1) return
    historyCursorRef.current += 1
    const snapshot = historyRef.current[historyCursorRef.current]
    if (snapshot) {
      applySnapshot(snapshot)
    }
  }, [applySnapshot, readOnly])

  const handleBatchShift = useCallback(() => {
    if (readOnly) return
    const days = Number.parseInt(batchShiftDays, 10)
    if (Number.isNaN(days)) return
    const selected = new Set(normalizedSelectedItemIds)
    const nextItems = editorItems.map((item) =>
      selected.has(item.id)
        ? {
            ...item,
            planned_start_date: shiftDateValue(item.planned_start_date, days),
            planned_end_date: shiftDateValue(item.planned_end_date, days),
          }
        : item,
    )
    commitSnapshot(nextItems, normalizedSelectedItemIds)
  }, [batchShiftDays, commitSnapshot, editorItems, normalizedSelectedItemIds, readOnly])

  const handleBatchSetProgress = useCallback(() => {
    if (readOnly) return
    const value = Number.parseInt(batchProgressValue, 10)
    if (Number.isNaN(value)) return
    const selected = new Set(normalizedSelectedItemIds)
    const nextProgress = Math.max(0, Math.min(100, value))
    const nextItems = editorItems.map((item) =>
      selected.has(item.id) ? { ...item, target_progress: nextProgress } : item,
    )
    commitSnapshot(nextItems, normalizedSelectedItemIds)
  }, [batchProgressValue, commitSnapshot, editorItems, normalizedSelectedItemIds, readOnly])

  const handleBatchDelete = useCallback(() => {
    if (readOnly) return
    const selected = new Set(normalizedSelectedItemIds)
    const nextItems = editorItems.filter((item) => !selected.has(item.id))
    commitSnapshot(nextItems, [])
  }, [commitSnapshot, editorItems, normalizedSelectedItemIds, readOnly])

  const handleForceUnlock = useCallback(async () => {
    if (!activeBaseline || !canForceUnlock) return
    setActionLoading('unlock')
    try {
      await apiPost(`/api/task-baselines/${activeBaseline.id}/force-unlock`, { reason: 'manual_release' })
      const response = await apiPost<{ lock: PlanningDraftLockRecord }>(`/api/task-baselines/${activeBaseline.id}/lock`)
      setDraftLock(response.lock)
      setInternalReadOnly(false)
      setDraftStatus('editing')
      setStatusNotice('已重新获取编辑锁，可以继续整理当前草稿。')
    } catch (unlockError) {
      setInternalReadOnly(true)
      setDraftLock(null)
      setDraftStatus('locked')
      toast({
        title: '强制解锁失败',
        description: getApiErrorMessage(unlockError, '请确认当前账号具备项目负责人权限后重试。'),
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }, [activeBaseline, canForceUnlock, setDraftStatus, toast])

  const handleSaveDraft = useCallback(async () => {
    if (!projectId || !activeBaseline) return
    setActionLoading('save')
    try {
      const created = await apiPost<BaselineDetail>(
        '/api/task-baselines',
        buildSavePayload(projectId, activeBaseline, editorItems, normalizedSelectedItemIds),
      )
      await loadBaselineContext({ preferredId: created.id })
      setStatusNotice('已生成新的基线草稿版本。')
    } catch (saveError) {
      toast({
        title: '保存草稿失败',
        description: getApiErrorMessage(saveError, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }, [activeBaseline, editorItems, loadBaselineContext, normalizedSelectedItemIds, projectId, toast])

  const handleCreateBlankBaseline = useCallback(async () => {
    if (!projectId) return
    setActionLoading('save')
    try {
      const created = await apiPost<BaselineDetail>('/api/task-baselines', {
        project_id: projectId,
        title: `${currentProject?.name ?? '项目'}空白基线`,
        description: '空白基线草稿',
        source_type: 'manual',
        source_version_label: '空白基线',
        items: [],
      })
      await loadBaselineContext({ preferredId: created.id })
      setStatusNotice('已创建空白基线草稿。')
    } catch (saveError) {
      toast({
        title: '创建空白基线失败',
        description: getApiErrorMessage(saveError, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }, [currentProject?.name, loadBaselineContext, projectId, toast])

  const handleBootstrapFromSchedule = useCallback(async () => {
    if (!projectId) return
    setActionLoading('save')
    try {
      const result = await apiPost<{ baseline?: BaselineDetail; needs_mapping_review?: boolean; created_item_count?: number }>(
        '/api/task-baselines/bootstrap/from-schedule',
        { project_id: projectId },
      )
      const createdBaselineId = result.baseline?.id ?? null
      if (createdBaselineId) {
        await loadBaselineContext({ preferredId: createdBaselineId })
      } else {
        await loadBaselineContext()
      }
      setStatusNotice(
        result.needs_mapping_review
          ? `已从当前排期生成初始化基线，${result.created_item_count ?? 0} 项进入待确认。`
          : `已从当前排期生成初始化基线。`,
      )
    } catch (saveError) {
      toast({
        title: '从当前排期生成失败',
        description: getApiErrorMessage(saveError, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }, [loadBaselineContext, projectId, toast])

  const handleConfirm = useCallback(async () => {
    if (!activeBaseline) return
    if (activeBaseline.status !== 'draft' && activeBaseline.status !== 'revising') {
      toast({
        title: '当前版本不可确认',
        description: '仅草稿态或修订态基线可以确认发布。',
        variant: 'destructive',
      })
      return
    }
    setActionLoading('confirm')
    try {
      await apiPost(`/api/task-baselines/${activeBaseline.id}/confirm`, { version: activeBaseline.version })
      setConfirmFailure(null)
      setConfirmOpen(false)
      await loadBaselineContext({ preferredId: activeBaseline.id })
      setStatusNotice('当前展示的是已确认版本')
    } catch (confirmError) {
      const message = getApiErrorMessage(confirmError, '请稍后重试。')
      const code = extractApiErrorCode(confirmError)
      setConfirmFailure({ code, message })
      if (code === 'REQUIRES_REALIGNMENT') {
        setStatusNotice('当前基线已触发待重整阈值，请先整理修订候选或回到草稿继续处理。')
        toast({
          title: '需要先处理待重整项',
          description: '确认弹窗已保留下一步入口，可直接打开计划修订候选后继续处理。',
          variant: 'destructive',
        })
        return
      }
      toast({
        title: '确认发布失败',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }, [activeBaseline, loadBaselineContext, toast])

  const handleQueueRealignment = useCallback(async () => {
    if (!activeBaseline || !canQueueRealignment) return
    setActionLoading('queue_realign')
    try {
      await apiPost(`/api/task-baselines/${activeBaseline.id}/queue-realignment`, {
        version: activeBaseline.version,
      })
      setConfirmFailure(null)
      setConfirmOpen(false)
      await loadBaselineContext({ preferredId: activeBaseline.id })
      setStatusNotice('已声明开始重排，当前版本进入待重排态。')
      toast({
        title: '已进入待重排态',
        description: `${currentLabel} 已标记为待重排，可继续在完成后结束重排。`,
      })
    } catch (realignmentError) {
      toast({
        title: '开始重排失败',
        description: getApiErrorMessage(realignmentError, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }, [activeBaseline, canQueueRealignment, currentLabel, loadBaselineContext, toast])

  const handleConfirmDialogOpenChange = useCallback((open: boolean) => {
    setConfirmOpen(open)
    if (!open) {
      setConfirmFailure(null)
    }
  }, [])

  const handleOpenConfirmDialog = useCallback(() => {
    setConfirmFailure(null)
    setConfirmOpen(true)
  }, [])

  const handleOpenRevisionPoolFromConfirm = useCallback(() => {
    setConfirmFailure(null)
    setConfirmOpen(false)
    setRevisionPoolOpen(true)
    setStatusNotice('已打开计划修订候选，可先整理待重整项后再回到确认流程。')
  }, [])

  const handleResolveRealignment = useCallback(async () => {
    if (!activeBaseline || !canResolveRealignment) return
    setActionLoading('resolve_realign')
    try {
      await apiPost(`/api/task-baselines/${activeBaseline.id}/resolve-realignment`, {
        version: activeBaseline.version,
      })
      await loadBaselineContext({ preferredId: activeBaseline.id })
      setStatusNotice('已结束重排，当前版本恢复为已确认状态。')
      toast({
        title: '重排已结束',
        description: `${currentLabel} 已恢复到确认状态。`,
      })
    } catch (realignmentError) {
      toast({
        title: '结束重排失败',
        description: getApiErrorMessage(realignmentError, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }, [activeBaseline, canResolveRealignment, currentLabel, loadBaselineContext, toast])

  const handleContinueDraftWorkspace = useCallback(() => {
    setResumeDialogOpen(false)
    setStatusNotice('已恢复上次基线草稿工作区，可以继续沿用当前校核上下文。')
  }, [])

  const handleDiscardDraftWorkspace = useCallback(() => {
    clearPlanningDraftResumeSnapshot(baselineDraftResumeKey)
    setResumeSnapshot(null)
    setResumeDialogOpen(false)
    setStatusNotice('已放弃本地草稿工作区状态，当前按服务端基线重新开始。')
  }, [baselineDraftResumeKey])

  const handleBaselineImportFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return

    setImportParsing(true)
    setImportError(null)
    setImportProgress(0)
    setImportMappingConfirmed(false)
    try {
      const preview = await parseBaselineImportFile(file)
      setImportPreview(preview)
      setImportProgress(calculateImportMappingProgress(preview.mapping))
      setStatusNotice(`已解析 ${preview.fileName}，可先预览再生成导入基线草稿。`)
    } catch (error) {
      setImportPreview(null)
      setImportProgress(0)
      setImportError(getApiErrorMessage(error, '导入文件解析失败，请检查表头和日期格式。'))
    } finally {
      setImportParsing(false)
      input.value = ''
    }
  }, [])

  const handleImportColumnMappingChange = useCallback((field: BaselineImportFieldKey, columnName: string) => {
    if (!importPreview) return

    setImportMappingConfirmed(false)
    const nextMapping = { ...importPreview.mapping, [field]: columnName }
    const nextPreview = buildBaselineImportPreview({
      fileName: importPreview.fileName,
      sheetName: importPreview.sheetName,
      importedAt: importPreview.importedAt,
      sourceRows: importPreview.sourceRows,
      columns: importPreview.columns,
      mapping: nextMapping,
    })
    setImportPreview(nextPreview)
    setImportProgress(calculateImportMappingProgress(nextMapping))
  }, [importPreview])

  const handleCreateImportedBaseline = useCallback(async () => {
    if (!projectId || !importPreview || !importMappingConfirmed) return
    setActionLoading('save')
    try {
      setImportProgress(25)
      const created = await apiPost<BaselineDetail>('/api/task-baselines', {
        project_id: projectId,
        title: `${currentProject?.name ?? '项目'}导入基线`,
        description: `来源文件 ${importPreview.fileName} / 工作表 ${importPreview.sheetName}`,
        source_type: 'imported_file',
        source_version_label: importPreview.fileName,
        items: importPreview.rows.map((row) => ({
          parent_item_id: null,
          source_task_id: null,
          source_milestone_id: null,
          title: row.title,
          planned_start_date: row.planned_start_date,
          planned_end_date: row.planned_end_date,
          target_progress: row.target_progress,
          sort_order: row.sort_order,
          is_milestone: row.is_milestone,
          is_critical: false,
          mapping_status: 'pending',
          notes: row.notes,
        })),
      })
      setImportProgress(75)
      await loadBaselineContext({ preferredId: created.id })
      setImportProgress(100)
      setImportPreview(null)
      setImportError(null)
      setImportMappingConfirmed(false)
      setImportProgress(0)
      setStatusNotice(`已从 ${importPreview.fileName} 生成导入基线草稿。`)
    } catch (error) {
      toast({
        title: '导入基线失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
      setImportProgress(0)
    } finally {
      setActionLoading(null)
    }
  }, [currentProject?.name, importMappingConfirmed, importPreview, loadBaselineContext, projectId, toast])

  const rows = useMemo(() => {
    const depthMap = buildDepthMap(editorItems)
    return [...editorItems]
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((item) => {
        const depth = depthMap.get(item.id) ?? 1
        const titleKey = `${item.id}:title`
        const startKey = `${item.id}:start`
        const endKey = `${item.id}:end`
        const progressKey = `${item.id}:progress`

        return {
          id: item.id,
          title: item.title,
          subtitle: item.is_milestone ? '关键节点' : item.mapping_status === 'pending' ? '映射待确认' : '基线条目',
          depth,
          rowType: item.is_milestone ? 'milestone' : depth === 1 ? 'structure' : 'leaf',
          isMilestone: Boolean(item.is_milestone),
          isCritical: Boolean(item.is_critical),
          selected: normalizedSelectedItemIds.includes(item.id),
          locked: false,
          startDateLabel: item.planned_start_date ?? '—',
          endDateLabel: item.planned_end_date ?? '—',
          progressLabel: item.target_progress == null ? '—' : `${item.target_progress}%`,
          mappingStatus: item.mapping_status === 'pending' ? '映射待确认' : null,
          statusLabel: item.is_milestone ? '里程碑' : undefined,
          onAddSibling: readOnly
            ? undefined
            : () => {
                const targetIndex = editorItems.findIndex((entry) => entry.id === item.id)
                if (targetIndex < 0) return
                const target = editorItems[targetIndex]
                const nextItem: BaselineItem = {
                  ...target,
                  id: `baseline-sibling-${Date.now()}-${targetIndex}`,
                  title: `${target.title}（新同级）`,
                  sort_order: target.sort_order + 1,
                  parent_item_id: target.parent_item_id ?? null,
                  source_task_id: target.source_task_id ?? null,
                  source_milestone_id: target.source_milestone_id ?? null,
                  template_id: target.template_id ?? null,
                  template_node_id: target.template_node_id ?? null,
                  mapping_status: target.mapping_status === 'missing' ? 'pending' : (target.mapping_status ?? 'pending'),
                  notes: target.notes ?? null,
                }
                const nextItems = [...editorItems]
                nextItems.splice(targetIndex + 1, 0, nextItem)
                const normalizedNextItems = nextItems.map((entry, index) => ({ ...entry, sort_order: index }))
                commitSnapshot(normalizedNextItems, [...normalizedSelectedItemIds, nextItem.id])
                setStatusNotice(`已在“${target.title}”后新增一个同级条目。`)
              },
          titleCell: (
            <div className="space-y-1">
              <div className="truncate text-xs text-slate-500">{inputDrafts[titleKey] ?? item.title}</div>
              <Input
                value={inputDrafts[titleKey] ?? item.title}
                onChange={(event) => handleDraftChange(item.id, 'title', event.target.value)}
                onBlur={() => commitFieldEdit(item.id, 'title')}
                onKeyDown={(event) => handleInputKeyDown(event, item.id, 'title')}
                disabled={readOnly}
                data-baseline-editor-cell={`${item.id}:title`}
                className="h-9 border-slate-200 bg-white text-sm"
              />
            </div>
          ),
          startCell: (
            <Input
              type="date"
              value={inputDrafts[startKey] ?? item.planned_start_date ?? ''}
              onChange={(event) => handleDraftChange(item.id, 'start', event.target.value)}
              onBlur={() => commitFieldEdit(item.id, 'start')}
              onKeyDown={(event) => handleInputKeyDown(event, item.id, 'start')}
              disabled={readOnly}
              data-baseline-editor-cell={`${item.id}:start`}
              className="h-9 border-slate-200 bg-white text-sm"
            />
          ),
          endCell: (
            <Input
              type="date"
              value={inputDrafts[endKey] ?? item.planned_end_date ?? ''}
              onChange={(event) => handleDraftChange(item.id, 'end', event.target.value)}
              onBlur={() => commitFieldEdit(item.id, 'end')}
              onKeyDown={(event) => handleInputKeyDown(event, item.id, 'end')}
              disabled={readOnly}
              data-baseline-editor-cell={`${item.id}:end`}
              className="h-9 border-slate-200 bg-white text-sm"
            />
          ),
          progressCell: (
            <Input
              type="number"
              min={0}
              max={100}
              value={inputDrafts[progressKey] ?? (item.target_progress == null ? '' : String(item.target_progress))}
              onChange={(event) => handleDraftChange(item.id, 'progress', event.target.value)}
              onBlur={() => commitFieldEdit(item.id, 'progress')}
              onKeyDown={(event) => handleInputKeyDown(event, item.id, 'progress')}
              disabled={readOnly}
              data-baseline-editor-cell={`${item.id}:progress`}
              className="h-9 border-slate-200 bg-white text-sm"
            />
          ),
        } satisfies PlanningTreeRow
      })
  }, [
    commitFieldEdit,
    commitSnapshot,
    editorItems,
    handleDraftChange,
    handleInputKeyDown,
    inputDrafts,
    normalizedSelectedItemIds,
    readOnly,
    setStatusNotice,
  ])

  rowsRef.current = rows

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (filterMode === 'mapping_attention') return Boolean(row.mappingStatus)
        if (filterMode === 'critical') return Boolean(row.isCritical)
        if (filterMode === 'milestone') return Boolean(row.isMilestone)
        return true
      }),
    [filterMode, rows],
  )
  const diffItems = useMemo(
    () => buildDiffItems(compareBaseline?.items ?? [], editorItems),
    [compareBaseline?.items, editorItems],
  )
  const noDiff = diffItems.length === 0
  const modifiedItemCount = activeBaseline?.modified_item_count ?? diffItems.length
  const milestoneChangeCount =
    activeBaseline?.milestone_change_count ?? diffItems.filter((item) => item.kind === '里程碑变动').length
  const criticalPathChangeCount =
    activeBaseline?.critical_path_change_count ?? diffItems.filter((item) => item.kind === '修改' || item.kind === '里程碑变动').length
  const mappingAffectedCount =
    activeBaseline?.mapping_affected_count ?? editorItems.filter((item) => item.mapping_status === 'pending').length
  const localRevisionCandidates = useMemo<BaselineRevisionCandidate[]>(() => {
    const currentTimestamp = new Date().toISOString()
    const sourceWindowStart = compareBaseline?.effective_from ?? compareBaseline?.updated_at ?? null
    const sourceWindowEnd = activeBaseline?.updated_at ?? null
    if (diffItems.length > 0) {
      return diffItems.slice(0, 6).map((item) => ({
        id: `baseline-revision-${item.id}`,
        title: item.title,
        summary: item.note ?? `${item.before} → ${item.after}`,
        source: `来自${item.kind}差异`,
        tag: item.kind,
        priority: item.kind === '里程碑变动' || item.kind === '移除' ? 'high' : item.kind === '修改' ? 'medium' : 'low',
        severity: item.kind === '移除' ? 'critical' : item.kind === '里程碑变动' ? 'high' : item.kind === '修改' ? 'medium' : 'low',
        source_type: 'observation',
        source_id: item.id,
        reason: item.note ?? `${item.before} → ${item.after}`,
        status: 'open',
        observation_window_start: sourceWindowStart,
        observation_window_end: sourceWindowEnd,
        affects_critical_milestone: item.kind === '里程碑变动' || item.kind === '移除',
        consecutive_cross_month_count: item.kind === '移除' ? 2 : 1,
        deferred_reason: null,
        review_due_at: null,
        reviewed_by: null,
        submitted_at: null,
        reviewed_at: null,
        created_at: currentTimestamp,
        updated_at: currentTimestamp,
      }))
    }

    return editorItems.slice(0, 6).map((item) => ({
      id: `baseline-revision-item-${item.id}`,
      title: item.title,
      summary: describeBaselineItem(item),
      source: '来自当前基线结构',
      tag: item.is_milestone ? '里程碑' : item.is_critical ? '关键路径' : '基线条目',
      priority: item.is_critical ? 'high' : item.is_milestone ? 'medium' : 'low',
      severity: item.is_critical ? 'high' : item.is_milestone ? 'medium' : 'low',
      source_type: 'manual',
      source_id: item.id,
      reason: describeBaselineItem(item),
      status: 'open',
      observation_window_start: sourceWindowStart,
      observation_window_end: sourceWindowEnd,
      affects_critical_milestone: Boolean(item.is_milestone),
      consecutive_cross_month_count: item.is_milestone ? 1 : 0,
      deferred_reason: null,
      review_due_at: null,
      reviewed_by: null,
      submitted_at: null,
      reviewed_at: null,
      created_at: currentTimestamp,
      updated_at: currentTimestamp,
    }))
  }, [
    activeBaseline?.effective_from,
    activeBaseline?.updated_at,
    compareBaseline?.effective_from,
    compareBaseline?.updated_at,
    diffItems,
    editorItems,
  ])
  const revisionCandidates = useMemo<BaselineRevisionCandidate[]>(() => {
    if (revisionPoolData) {
      return (Array.isArray(revisionPoolData.items) ? revisionPoolData.items : []).map(mapRevisionPoolCandidate)
    }
    return localRevisionCandidates
  }, [localRevisionCandidates, revisionPoolData])
  useEffect(() => {
    if (!revisionCandidates.length) {
      setRevisionActiveCandidateId(null)
      setRevisionBasketIds([])
      setRevisionDeferredCandidateIds([])
      setRevisionDeferredReason('')
      setRevisionDeferredReviewDueAt('')
      setRevisionDeferredReasonVisible(false)
      return
    }

    if (!revisionActiveCandidateId || !revisionCandidates.some((candidate) => candidate.id === revisionActiveCandidateId)) {
      setRevisionActiveCandidateId(revisionCandidates[0].id)
    }

    setRevisionBasketIds((current) => current.filter((id) => revisionCandidates.some((candidate) => candidate.id === id)))
    setRevisionDeferredCandidateIds((current) =>
      current.filter((id) => revisionCandidates.some((candidate) => candidate.id === id)),
    )
  }, [revisionActiveCandidateId, revisionCandidates])
  const revisionActiveCandidate = useMemo(
    () =>
      revisionCandidates.find((candidate) => candidate.id === revisionActiveCandidateId) ??
      revisionCandidates[0] ??
      null,
    [revisionActiveCandidateId, revisionCandidates],
  )
  const revisionBasketItems = useMemo(
    () => revisionCandidates.filter((candidate) => revisionBasketIds.includes(candidate.id)),
    [revisionBasketIds, revisionCandidates],
  )
  const revisionPriorityLabel = useMemo(() => {
    if (!revisionCandidates.length) return '暂无候选'
    if (
      revisionCandidates.some((item) =>
        ['critical', 'high'].includes(String(item.priority ?? item.severity ?? '').toLowerCase()),
      )
    ) {
      return '高优先级'
    }
    return '待整理'
  }, [revisionCandidates])
  const mappingSummary = useMemo(() => {
    const total = editorItems.length
    const attention = editorItems.filter((item) => item.mapping_status === 'pending').length
    return {
      total,
      attention,
      aligned: Math.max(0, total - attention),
    }
  }, [editorItems])
  const isDirty = useMemo(() => {
    if (!activeBaseline) return false
    return (
      serializeItems(editorItems) !== serializeItems(activeBaseline.items ?? []) ||
      !sameIdSequence(normalizedSelectedItemIds, (activeBaseline.items ?? []).map((item) => item.id))
    )
  }, [activeBaseline, editorItems, normalizedSelectedItemIds])
  const canUndo = historyCursorRef.current > 0
  const canRedo = historyCursorRef.current >= 0 && historyCursorRef.current < historyRef.current.length - 1
  const handleRevisionAddToBasket = useCallback(() => {
    if (!revisionActiveCandidate) return
    setRevisionBasketIds((current) =>
      current.includes(revisionActiveCandidate.id) ? current : [...current, revisionActiveCandidate.id],
    )
    setStatusNotice(`已将“${revisionActiveCandidate.title}”纳入本次修订候选。`)
  }, [revisionActiveCandidate])

  const handleRevisionMarkDeferred = useCallback(() => {
    if (!revisionActiveCandidate) return
    setRevisionDeferredCandidateIds((current) =>
      current.includes(revisionActiveCandidate.id) ? current : [...current, revisionActiveCandidate.id],
    )
    setRevisionDeferredReasonVisible(true)
    setRevisionDeferredReviewDueAt((current) => current || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
    setStatusNotice(`已把“${revisionActiveCandidate.title}”标记为暂不处理。`)
  }, [revisionActiveCandidate])

  const handleRevisionEnterDraft = useCallback(async () => {
    if (!activeBaseline) {
      setRevisionPoolOpen(false)
      return
    }

    setActionLoading('save')
    try {
      const selectedCandidateIds = Array.from(new Set([...revisionBasketIds, ...revisionDeferredCandidateIds]))
      const result = await apiPost<{ revision_id?: string }>(`/api/task-baselines/${activeBaseline.id}/revisions`, {
        baseline_version_id: activeBaseline.id,
        reason: revisionDeferredReason.trim() || '从修订候选进入修订草稿',
        source_candidate_ids: selectedCandidateIds,
      })
      await loadBaselineContext({ preferredId: result.revision_id ?? activeBaseline.id })
      setStatusNotice('已发起基线修订，可继续在基线页完成整理。')
    } catch (error) {
      toast({
        title: '进入修订草稿失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
      setRevisionPoolOpen(false)
    }
  }, [activeBaseline, loadBaselineContext, revisionBasketIds, revisionDeferredCandidateIds, revisionDeferredReason, toast])

  const handleAddSiblingItem = useCallback((itemId: string) => {
    if (readOnly) return
    const targetIndex = editorItems.findIndex((item) => item.id === itemId)
    if (targetIndex < 0) return

    const target = editorItems[targetIndex]
    const nextItem: BaselineItem = {
      ...target,
      id: `baseline-sibling-${Date.now()}-${targetIndex}`,
      title: `${target.title}（新同级）`,
      sort_order: target.sort_order + 1,
      parent_item_id: target.parent_item_id ?? null,
      source_task_id: target.source_task_id ?? null,
      source_milestone_id: target.source_milestone_id ?? null,
      template_id: target.template_id ?? null,
      template_node_id: target.template_node_id ?? null,
      mapping_status: target.mapping_status === 'missing' ? 'pending' : (target.mapping_status ?? 'pending'),
      notes: target.notes ?? null,
    }

    const nextItems = [...editorItems]
    nextItems.splice(targetIndex + 1, 0, nextItem)
    const normalizedNextItems = nextItems.map((item, index) => ({ ...item, sort_order: index }))
    commitSnapshot(normalizedNextItems, [...normalizedSelectedItemIds, nextItem.id])
    setStatusNotice(`已在“${target.title}”后新增一个同级条目。`)
  }, [commitSnapshot, editorItems, normalizedSelectedItemIds, readOnly])

  const unsavedChangesGuard = useUnsavedChangesGuard(
    Boolean(isDirty),
    '基线草稿还有未保存调整，离开后这些修改将丢失，确认继续吗？',
  )
  const navigateWithGuard = useCallback(
    (to: string) => {
      unsavedChangesGuard.guardNavigation(() => navigate(to))
    },
    [navigate, unsavedChangesGuard],
  )

  const handleCompareVersionChange = useCallback(async (nextCompareId: string) => {
    if (!activeBaseline) return

    if (!nextCompareId) {
      compareVersionPreferenceRef.current = null
      setCompareVersionId(null)
      setCompareBaseline(null)
      setStatusNotice(buildBaselineStatusNotice(activeBaseline.status, formatVersionLabel()))
      return
    }

    if (nextCompareId === activeBaseline.id) return

    try {
      const detail = await apiGet<BaselineDetail>(
        `/api/task-baselines/${nextCompareId}?project_id=${encodeURIComponent(projectId)}`,
      )
      compareVersionPreferenceRef.current = nextCompareId
      setCompareVersionId(nextCompareId)
      setCompareBaseline(detail)
      setStatusNotice(buildBaselineStatusNotice(activeBaseline.status, formatVersionLabel(detail.version)))
    } catch (error) {
      setError(getApiErrorMessage(error, '对比版本加载失败，请稍后重试。'))
    }
  }, [activeBaseline])

  const tabs = TABS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    active: tab.key === 'baseline',
    onClick: () => {
      if (!projectId || tab.key === 'baseline') return
      navigateWithGuard(`/projects/${projectId}/planning/${tab.key}`)
    },
  }))

  if (loading) {
    return <LoadingState label="正在加载项目基线..." />
  }

  if (error) {
    return (
      <div className="px-6 py-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!activeBaseline) {
    const creationDisabled = !canEdit || actionLoading === 'save'

    return (
      <PlanningPageShell
        projectName={currentProject?.name ?? '项目'}
        title="计划编制 / 项目基线"
        description="从空白基线、当前排期或导入文件建立项目基线，并在树表里继续校核。"
        tabs={tabs}
      >
        {statusNotice ? (
          <Alert className="mb-4" data-testid="baseline-status-notice">
            <AlertDescription>{statusNotice}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-4">
          <Card data-testid="baseline-entry-selector" className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">首版基线创建入口</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <button
                type="button"
                data-testid="baseline-entry-blank"
                onClick={() => void handleCreateBlankBaseline()}
                disabled={creationDisabled}
                className="group flex min-h-[172px] flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 transition group-hover:bg-slate-900 group-hover:text-white">
                    <FilePlus2 className="h-5 w-5" />
                  </div>
                  <Badge variant="outline">空白基线</Badge>
                </div>
                <div className="space-y-2">
                  <div className="text-base font-semibold text-slate-900">新建空白基线</div>
                  <p className="text-sm leading-6 text-slate-500">
                    从零开始搭建项目基线骨架，适合先手工整理再校核。
                  </p>
                </div>
              </button>
              <button
                type="button"
                data-testid="baseline-entry-schedule"
                onClick={() => void handleBootstrapFromSchedule()}
                disabled={creationDisabled}
                className="group flex min-h-[172px] flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700 transition group-hover:bg-cyan-600 group-hover:text-white">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <Badge variant="outline">当前排期</Badge>
                </div>
                <div className="space-y-2">
                  <div className="text-base font-semibold text-slate-900">从当前排期生成</div>
                  <p className="text-sm leading-6 text-slate-500">
                    直接把当前排期整理成初始化基线，保留待确认映射再继续校核。
                  </p>
                </div>
              </button>
              <button
                type="button"
                data-testid="baseline-entry-import"
                onClick={() => importInputRef.current?.click()}
                disabled={creationDisabled}
                className="group flex min-h-[172px] flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 transition group-hover:bg-amber-600 group-hover:text-white">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <Badge variant="outline">文件导入</Badge>
                </div>
                <div className="space-y-2">
                  <div className="text-base font-semibold text-slate-900">导入计划文件</div>
                  <p className="text-sm leading-6 text-slate-500">
                    按表头映射导入计划文件，先预览 10 行再生成导入基线草稿。
                  </p>
                </div>
              </button>
            </CardContent>
          </Card>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
            只保留空白基线、当前排期和导入三种入口；进入基线后再在页内继续编辑、校核和确认。
          </div>
        </div>

        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleBaselineImportFileChange}
        />

        {importParsing ? (
          <LoadingState
            label="正在解析计划文件"
            description=""
            className="min-h-32 rounded-2xl border border-slate-200 bg-white"
          />
        ) : null}

        {importError ? (
          <Alert variant="destructive" data-testid="baseline-import-error">
            <AlertDescription>{importError}</AlertDescription>
          </Alert>
        ) : null}

        {importPreview ? (
          <Card data-testid="baseline-import-preview" className="border-amber-200 bg-amber-50 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-4 w-4 text-amber-700" />
                导入预览
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-700">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-white/80 bg-white px-4 py-3">
                  <div className="text-xs text-slate-500">文件</div>
                  <div className="mt-1 font-medium text-slate-900">{importPreview.fileName}</div>
                </div>
                <div className="rounded-2xl border border-white/80 bg-white px-4 py-3">
                  <div className="text-xs text-slate-500">工作表</div>
                  <div className="mt-1 font-medium text-slate-900">{importPreview.sheetName}</div>
                </div>
                <div className="rounded-2xl border border-white/80 bg-white px-4 py-3">
                  <div className="text-xs text-slate-500">导入条目</div>
                  <div className="mt-1 font-medium text-slate-900">{importPreview.rows.length}</div>
                </div>
                <div className="rounded-2xl border border-white/80 bg-white px-4 py-3">
                  <div className="text-xs text-slate-500">预警提示</div>
                  <div className="mt-1 font-medium text-slate-900">{importPreview.warnings.length}</div>
                </div>
                <div className="rounded-2xl border border-white/80 bg-white px-4 py-3">
                  <div className="text-xs text-slate-500">映射完成度</div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${importProgress}%` }} />
                  </div>
                  <div className="mt-2 text-sm font-medium text-slate-900">{importProgress}%</div>
                </div>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white px-4 py-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-slate-900">列映射</div>
                    <div className="text-xs text-slate-500">把 Excel 表头对应到基线字段，再确认导入。</div>
                  </div>
                  <Badge variant="outline">
                    {BASELINE_IMPORT_FIELD_CONFIG.filter((field) => Boolean(importPreview.mapping[field.key])).length}/
                    {BASELINE_IMPORT_FIELD_CONFIG.length} 已匹配
                  </Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {BASELINE_IMPORT_FIELD_CONFIG.map((field) => (
                    <label key={field.key} className="block space-y-1">
                      <span className="text-xs font-medium text-slate-500">
                        {field.label}
                        {field.required ? '（必填）' : '（可选）'}
                      </span>
                      <select
                        data-testid={`baseline-import-mapping-${field.key}`}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                        value={importPreview.mapping[field.key]}
                        onChange={(event) => handleImportColumnMappingChange(field.key, event.target.value)}
                      >
                        <option value="">未映射</option>
                        {importPreview.columns.map((column) => (
                          <option key={column} value={column}>
                            {column}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-start gap-3 rounded-2xl border border-white/80 bg-white px-4 py-3">
                <input
                  type="checkbox"
                  checked={importMappingConfirmed}
                  onChange={(event) => setImportMappingConfirmed(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-cyan-600"
                />
                <span className="text-sm leading-6 text-slate-700">
                  已确认列映射与字段对应关系，再生成导入基线草稿
                </span>
              </label>
              <div className="space-y-2">
                {importPreview.rows.slice(0, 10).map((row) => (
                  <div key={row.id} className="rounded-2xl border border-white/80 bg-white px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{row.title}</span>
                      {row.is_milestone ? <Badge variant="outline">里程碑</Badge> : null}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {row.planned_start_date ?? '未设开始'} → {row.planned_end_date ?? '未设结束'}
                      {' · '}
                      目标进度 {row.target_progress ?? '未设'}%
                    </div>
                  </div>
                ))}
                {importPreview.rows.length > 10 ? (
                  <div className="text-xs text-slate-500">其余 {importPreview.rows.length - 10} 项会在生成草稿后进入基线树继续校核。</div>
                ) : null}
                {importPreview.warnings.length > 0 ? (
                  <div className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-xs leading-5 text-amber-800">
                    {importPreview.warnings[0]}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void handleCreateImportedBaseline()}
                  loading={actionLoading === 'save'}
                  disabled={!canEdit || !importMappingConfirmed}
                >
                  生成导入基线草稿
                </Button>
                <Button type="button" variant="outline" onClick={() => importInputRef.current?.click()} disabled={!canEdit}>
                  重新选择文件
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </PlanningPageShell>
    )
  }

  return (
    <PlanningPageShell
      projectName={currentProject?.name ?? '项目'}
      title="计划编制 / 项目基线"
      description="继续对比、修订和确认当前项目基线。"
      tabs={tabs}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {canQueueRealignment ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="baseline-queue-realignment"
              onClick={() => void handleQueueRealignment()}
              loading={actionLoading === 'queue_realign'}
              disabled={actionLoading === 'queue_realign'}
            >
              声明开始重排
            </Button>
          ) : null}
          {canResolveRealignment ? (
            <Button
              type="button"
              size="sm"
              data-testid="baseline-resolve-realignment"
              onClick={() => void handleResolveRealignment()}
              loading={actionLoading === 'resolve_realign'}
              disabled={actionLoading === 'resolve_realign'}
            >
              结束重排
            </Button>
          ) : null}
          {canForceUnlock ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleForceUnlock}
              disabled={readOnly || actionLoading === 'unlock'}
            >
              <LockKeyhole className="mr-2 h-4 w-4" />
              强制解锁
            </Button>
          ) : null}
        </div>
      }
    >
      {statusNotice ? (
        <Alert className="mb-4" data-testid="baseline-status-notice">
          <AlertDescription>{statusNotice}</AlertDescription>
        </Alert>
      ) : null}

      <PlanningWorkspaceLayers
        summary={
          <div
            data-testid="baseline-info-bar"
            className="rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
          >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-500">版本对照</div>
                <div className="text-lg font-semibold text-slate-900">
                  {compareLabel} → {currentLabel}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={readOnly ? 'outline' : 'secondary'}>{readOnly ? '只读查看态' : '可编辑态'}</Badge>
                  <Badge variant="outline">{formatStatusLabel(activeBaseline.status)}</Badge>
                  <Badge variant="outline">{lockRemainingLabel}</Badge>
                  <Badge
                    data-testid="baseline-validity-badge"
                    variant="outline"
                    className={
                      activeBaseline.status === 'pending_realign'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    }
                  >
                    {validityLabel}
                  </Badge>
                </div>
                <div className="text-sm text-slate-600">{buildBaselineStatusNotice(activeBaseline.status, compareLabel)}</div>
                <div className="text-xs text-slate-500">阈值结果：{validityHint}</div>
                {activeBaseline.status === 'pending_realign' ? (
                  <div
                    data-testid="baseline-realignment-hint"
                    className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
                  >
                    该版本正在主动重排窗口中，完成调整后请结束重排，让版本重新回到已确认态。
                  </div>
                ) : null}
                {activeBaseline.status === 'archived' ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    该版本已归档，适合作为修订前后的历史参照，不再参与当前编制动作。
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-500">校核与映射</div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    映射 {mappingSummary.aligned} / {mappingSummary.total}
                  </Badge>
                  <Badge variant="outline">已修改 {modifiedItemCount}</Badge>
                  <Badge variant="outline">里程碑 {milestoneChangeCount}</Badge>
                  <Badge variant="outline">关键路径 {criticalPathChangeCount}</Badge>
                  <Badge variant="outline">受影响映射 {mappingAffectedCount}</Badge>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={filterMode === 'mapping_attention' ? 'default' : 'outline'}
                  onClick={() =>
                    setFilterMode((current) => (current === 'mapping_attention' ? 'all' : 'mapping_attention'))
                  }
                  data-testid="baseline-filter-mapping-attention"
                >
                  {mappingSummary.attention > 0 ? `${mappingSummary.attention} 项待补齐` : '当前映射已全部对齐'}
                </Button>
              </div>
              <div className="space-y-3">
                <div className="text-sm font-medium text-slate-500">修订与留痕</div>
                <div className="text-lg font-semibold text-slate-900">{activeBaseline.updated_at ?? '暂无'}</div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">版本 {versions.length}</Badge>
                  <Badge variant="secondary">{revisionCandidates.length} 项候选</Badge>
                  <Badge variant="outline">当前视图 {filteredRows.length} 项</Badge>
                  <Badge variant="outline">已选 {normalizedSelectedItemIds.length} 项</Badge>
                </div>
                <div className="grid gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="justify-between"
                    onClick={() => setRevisionPoolOpen(true)}
                    data-testid="baseline-info-open-revision-pool"
                  >
                    <span className="flex items-center gap-2">
                      <FolderGit2 className="h-4 w-4" />
                      计划修订候选
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge variant="secondary">{revisionPriorityLabel}</Badge>
                      <Badge variant="outline">{revisionCandidates.length} 项</Badge>
                    </span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                  variant="outline"
                  className="justify-between"
                  onClick={() => navigateWithGuard(`/projects/${projectId}/reports?view=change_log`)}
                  data-testid="baseline-open-change-log"
                >
                    <span className="flex items-center gap-2">
                      <History className="h-4 w-4" />
                      变更记录分析
                    </span>
                    <Badge variant="outline">Reports</Badge>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        }
        sectionHeader={
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={filterMode === 'all' ? 'default' : 'outline'}
                onClick={() => setFilterMode('all')}
                data-testid="baseline-filter-all"
              >
                全部条目
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filterMode === 'critical' ? 'default' : 'outline'}
                onClick={() => setFilterMode('critical')}
              >
                关键路径
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filterMode === 'milestone' ? 'default' : 'outline'}
                onClick={() => setFilterMode('milestone')}
              >
                里程碑
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filterMode === 'mapping_attention' ? 'default' : 'outline'}
                onClick={() => setFilterMode('mapping_attention')}
              >
                映射待确认
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowValidationPanel((value) => !value)}
                data-testid="baseline-validation-toggle"
              >
                {showValidationPanel ? '收起校核面板' : '展开校核面板'}
              </Button>
            </div>
            <div className="text-sm text-slate-600">当前视图 {filteredRows.length} 项</div>
          </div>
        }
        main={
          <div className="space-y-4 pb-28">
            <BaselineTreeEditor
              rows={filteredRows}
              selectedCount={normalizedSelectedItemIds.length}
              readOnly={readOnly}
              isDirty={isDirty}
              lockRemainingLabel={lockRemainingLabel}
              canUndo={canUndo}
              canRedo={canRedo}
              onToggleRow={handleToggleRow}
              onToggleAll={handleToggleAll}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onForceUnlock={handleForceUnlock}
            />
            {showValidationPanel ? (
              <div
                data-testid="baseline-validation-bottom-panel"
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-900">异常校核区</div>
                </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowValidationPanel(false)}
                  >
                    收起校核面板
                  </Button>
                </div>
                <div className="mt-4">
                  <BaselineValidationPanel issues={validationIssues} />
                </div>
              </div>
            ) : null}
          </div>
        }
        aside={
          <div className="space-y-4">
            <Card data-testid="baseline-version-switcher">
              <CardHeader>
                <CardTitle className="text-base">历史版本对比</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Tabs
                  value={activeBaseline.id}
                  onValueChange={(value) => {
                    if (value && value !== activeBaseline.id) {
                      void loadBaselineContext({ preferredId: value })
                    }
                  }}
                >
                  <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
                    {versions.map((version) => (
                      <TabsTrigger
                        key={version.id}
                        value={version.id}
                        data-testid={`baseline-version-chip-${version.id}`}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 data-[state=active]:border-slate-900 data-[state=active]:bg-slate-900 data-[state=active]:text-white"
                        disabled={actionLoading !== null && activeBaseline.id === version.id}
                      >
                        v{version.version} · {formatStatusLabel(version.status)}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <label className="block space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">对比版本</span>
                  <select
                    value={compareVersionId ?? ''}
                    onChange={(event) => void handleCompareVersionChange(event.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                    data-testid="baseline-compare-version-select"
                  >
                    <option value="">不指定对比版本</option>
                    {versions
                      .filter((version) => version.id !== activeBaseline.id)
                      .map((version) => (
                        <option key={version.id} value={version.id}>
                          v{version.version} · {formatStatusLabel(version.status)}
                        </option>
                      ))}
                  </select>
                </label>
              </CardContent>
            </Card>
            <Card data-testid="baseline-diff-preview">
              <CardHeader>
                <CardTitle className="text-base">版本差异总览</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Badge variant="outline">{compareLabel} → {currentLabel}</Badge>
                  <Badge variant="secondary">{diffItems.length} 项变更</Badge>
                </div>
                {diffItems.length ? (
                  <>
                    <div className="max-h-[420px] overflow-y-auto pr-1">
                      <BaselineDiffView
                        fromVersionLabel={compareLabel}
                        toVersionLabel={currentLabel}
                        items={diffItems.slice(0, 3)}
                      />
                    </div>
                    {diffItems.length > 3 ? (
                      <div className="text-xs leading-5 text-slate-500">仅显示前 3 条</div>
                    ) : null}
                    <Button type="button" variant="outline" className="w-full" onClick={() => setConfirmOpen(true)}>
                      <FileDiff className="mr-2 h-4 w-4" />
                      展开完整对比
                    </Button>
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                    当前与对比版本暂无差异，可直接继续校核和确认流程。
                  </div>
                )}
                <div data-testid="baseline-change-log-preview" className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-slate-900">变更留痕</div>
                    <Badge variant="outline">
                      {changeLogsStatus.loading ? '同步中' : baselineChangeLogs.length ? `${baselineChangeLogs.length} 条` : '只读兜底'}
                    </Badge>
                  </div>
                  {baselineChangeLogs.length ? (
                    <div className="mt-3 space-y-2">
                      {baselineChangeLogs.map((record) => (
                        <div key={record.id} className="rounded-xl border border-white/80 bg-white px-3 py-2 text-xs text-slate-600">
                          <div className="font-medium text-slate-900">
                            {record.field_name}
                            {record.change_reason ? ` · ${record.change_reason}` : ''}
                          </div>
                          <div className="mt-1">
                            {record.old_value ?? '空'} → {record.new_value ?? '空'}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 text-xs leading-5 text-slate-500">暂无变更留痕</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        }
      />

      <BaselineBottomBar
        isDirty={isDirty}
        readOnly={readOnly}
        lockRemainingLabel={lockRemainingLabel}
        lastSavedLabel={activeBaseline.updated_at ?? '暂无'}
        canUndo={canUndo}
        canRedo={canRedo}
        saveDisabled={readOnly || normalizedSelectedItemIds.length === 0}
        saving={actionLoading === 'save'}
        selectedCount={normalizedSelectedItemIds.length}
        batchShiftDays={batchShiftDays}
        batchProgressValue={batchProgressValue}
        onBatchShiftDaysChange={setBatchShiftDays}
        onBatchProgressValueChange={setBatchProgressValue}
        onBatchDelete={handleBatchDelete}
        onBatchShift={handleBatchShift}
        onBatchSetProgress={handleBatchSetProgress}
        onOpenConfirm={handleOpenConfirmDialog}
        confirmDisabled={readOnly || noDiff || Boolean(confirmDisabledReason)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSaveDraft={handleSaveDraft}
      />

      <BaselineConfirmDialog
        open={confirmOpen}
        onOpenChange={handleConfirmDialogOpenChange}
        summary={{
          fromVersionLabel: compareLabel,
          toVersionLabel: currentLabel,
          items: diffItems,
          modifiedItemCount: activeBaseline.modified_item_count ?? diffItems.length,
          milestoneChangeCount: activeBaseline.milestone_change_count ?? diffItems.filter((item) => item.kind === '里程碑变动').length,
          criticalPathChangeCount: activeBaseline.critical_path_change_count ?? diffItems.filter((item) => item.kind === '修改' || item.kind === '里程碑变动').length,
          mappingAffectedCount: activeBaseline.mapping_affected_count ?? editorItems.filter((item) => item.mapping_status === 'pending').length,
        }}
        state={confirmState}
        failureCode={confirmFailure?.code ?? null}
        failureMessage={confirmFailure?.message ?? null}
        canConfirm={!confirmDisabledReason && !noDiff}
        confirmDisabledReason={noDiff ? '当前版本与对比版本没有差异。' : confirmDisabledReason}
        confirming={actionLoading === 'confirm'}
        onConfirm={handleConfirm}
        onRetry={handleConfirm}
        canQueueRealignment={canQueueRealignment}
        onQueueRealignment={handleQueueRealignment}
        onOpenRevisionPool={handleOpenRevisionPoolFromConfirm}
      />
      <BaselineRevisionPoolDialog
        open={revisionPoolOpen}
        sourceEntryLabel="基线信息带入口"
        candidates={revisionCandidates}
        summary={revisionPoolData?.summary ?? null}
        basketItems={revisionBasketItems}
        activeCandidateId={revisionActiveCandidate?.id ?? null}
        deferredCandidateIds={revisionDeferredCandidateIds}
        deferredReason={revisionDeferredReason}
        deferredReasonVisible={revisionDeferredReasonVisible}
        deferredReviewDueAt={revisionDeferredReviewDueAt}
        canEnterDraft={revisionBasketItems.length > 0 || Boolean(revisionDeferredReason.trim())}
        errorMessage={revisionPoolError}
        onOpenChange={setRevisionPoolOpen}
        onSelectCandidate={setRevisionActiveCandidateId}
        onAddToBasket={handleRevisionAddToBasket}
        onMarkDeferred={handleRevisionMarkDeferred}
        onDeferredReasonChange={setRevisionDeferredReason}
        onDeferredReviewDueAtChange={setRevisionDeferredReviewDueAt}
        onEnterDraft={handleRevisionEnterDraft}
        onRemoveFromBasket={(candidateId) => {
          setRevisionBasketIds((current) => current.filter((id) => id !== candidateId))
        }}
      />
      <PlanningDraftResumeDialog
        open={resumeDialogOpen}
        onOpenChange={setResumeDialogOpen}
        snapshot={resumeSnapshot}
        onContinue={handleContinueDraftWorkspace}
        onDiscard={handleDiscardDraftWorkspace}
      />
      <ConfirmActionDialog
        {...unsavedChangesGuard.confirmDialog}
        testId="baseline-unsaved-changes-dialog"
      />
    </PlanningPageShell>
  )
}
