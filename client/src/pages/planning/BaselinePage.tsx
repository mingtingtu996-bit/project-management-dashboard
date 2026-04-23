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
import { usePlanningStore } from '@/hooks/usePlanningStore'
import { useStore } from '@/hooks/useStore'
import { useToast } from '@/hooks/use-toast'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import { apiGet, apiPost, getApiErrorMessage } from '@/lib/apiClient'
import type { BaselineItem, BaselineVersion, PlanningDraftLockRecord } from '@/types/planning'
import { AlertTriangle, FileDiff, FileSpreadsheet, FolderGit2, History, LockKeyhole } from 'lucide-react'
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
type BaselineImportPreview = {
  fileName: string
  sheetName: string
  importedAt: string
  rows: BaselineImportPreviewRow[]
  warnings: string[]
}

const TABS = [
  { key: 'baseline', label: '项目基线' },
  { key: 'monthly', label: '月度计划' },
  { key: 'revision-pool', label: '计划修订候选' },
  { key: 'change-log', label: '变更记录' },
  { key: 'deviation', label: '报表分析' },
] as const

const BASELINE_IMPORT_TITLE_KEYS = ['任务名称', '标题', '名称', 'task_name', 'title', '任务', 'WBS名称'] as const
const BASELINE_IMPORT_START_KEYS = ['计划开始', '开始日期', 'planned_start_date', 'start_date', '开始'] as const
const BASELINE_IMPORT_END_KEYS = ['计划结束', '结束日期', 'planned_end_date', 'end_date', '结束'] as const
const BASELINE_IMPORT_PROGRESS_KEYS = ['目标进度', 'target_progress', '进度', 'progress', '目标进度(%)', '进度(%)'] as const
const BASELINE_IMPORT_NOTE_KEYS = ['备注', '说明', 'notes', 'description'] as const
const BASELINE_IMPORT_MILESTONE_KEYS = ['是否里程碑', '里程碑', 'is_milestone', 'milestone'] as const

function pickImportCell(row: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim().length > 0) {
      return row[key]
    }
  }
  return null
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
  const normalized = String(value ?? '').trim().toLowerCase()
  return ['1', 'true', 'yes', 'y', '是', '里程碑'].includes(normalized)
}

async function parseBaselineImportFile(file: File): Promise<BaselineImportPreview> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
  const warnings: string[] = []

  const previewRows = rows
    .map((row, index) => {
      const importedTitle = pickImportCell(row, BASELINE_IMPORT_TITLE_KEYS)
      const title = importedTitle ? String(importedTitle).trim() : `导入条目 ${index + 1}`
      if (!importedTitle) {
        warnings.push(`第 ${index + 1} 行未找到标题字段，已自动命名为“${title}”。`)
      }

      const planned_start_date = normalizeImportDate(pickImportCell(row, BASELINE_IMPORT_START_KEYS))
      const planned_end_date = normalizeImportDate(pickImportCell(row, BASELINE_IMPORT_END_KEYS))
      const target_progress = normalizeImportProgress(pickImportCell(row, BASELINE_IMPORT_PROGRESS_KEYS))
      const notes = (() => {
        const cell = pickImportCell(row, BASELINE_IMPORT_NOTE_KEYS)
        return cell ? String(cell).trim() : null
      })()
      const is_milestone = normalizeImportMilestone(pickImportCell(row, BASELINE_IMPORT_MILESTONE_KEYS))

      if (!title && !planned_start_date && !planned_end_date && target_progress == null && !notes) {
        return null
      }

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

  if (!previewRows.length) {
    throw new Error('导入文件中没有可用的基线条目。')
  }

  return {
    fileName: file.name,
    sheetName,
    importedAt: new Date().toISOString(),
    rows: previewRows,
    warnings,
  }
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
  const [readOnly, setReadOnly] = useState(false)
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
  const [batchShiftDays, setBatchShiftDays] = useState('1')
  const [batchProgressValue, setBatchProgressValue] = useState('')
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
  const canQueueRealignment = activeBaseline?.status === 'confirmed' || activeBaseline?.status === 'revising'
  const canResolveRealignment = activeBaseline?.status === 'pending_realign'
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

      const targetVersion = sorted.find((item) => item.id === preferredId)
        ?? sorted.find((item) => item.status === 'draft')
        ?? sorted[0]

      if (!targetVersion) {
        setActiveBaseline(null)
        setCompareBaseline(null)
        setEditorItems([])
        setReadOnly(true)
        setDraftLock(null)
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
        apiGet<BaselineDetail>(`/api/task-baselines/${targetVersion.id}`, { signal }),
        compareVersion ? apiGet<BaselineDetail>(`/api/task-baselines/${compareVersion.id}`, { signal }) : Promise.resolve(null),
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
          setReadOnly(false)
          setDraftStatus('editing')
          setStatusNotice(buildBaselineStatusNotice(nextActive.status, formatVersionLabel(nextCompare?.version)))
        } catch (lockError) {
          if (signal?.aborted) return
          setDraftLock(null)
          setReadOnly(true)
          setDraftStatus('locked')
          setStatusNotice(getApiErrorMessage(lockError, '当前草稿暂时无法获取编辑锁，已切换为只读查看。'))
        }
      } else {
        setDraftLock(null)
        setReadOnly(true)
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

    if (activeBaseline.status !== 'draft' || readOnly) {
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
    if (event.key === 'Enter') {
      event.preventDefault()
      commitFieldEdit(itemId, field)
      event.currentTarget.blur()
    }
  }, [commitFieldEdit])

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
    if (!activeBaseline || activeBaseline.status !== 'draft') return
    setActionLoading('unlock')
    try {
      await apiPost(`/api/task-baselines/${activeBaseline.id}/force-unlock`, { reason: 'manual_release' })
      const response = await apiPost<{ lock: PlanningDraftLockRecord }>(`/api/task-baselines/${activeBaseline.id}/lock`)
      setDraftLock(response.lock)
      setReadOnly(false)
      setDraftStatus('editing')
      setStatusNotice('已重新获取编辑锁，可以继续整理当前草稿。')
    } catch (unlockError) {
      setReadOnly(true)
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
  }, [activeBaseline, setDraftStatus, toast])

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

  const handleConfirm = useCallback(async () => {
    if (!activeBaseline) return
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
    try {
      const preview = await parseBaselineImportFile(file)
      setImportPreview(preview)
      setStatusNotice(`已解析 ${preview.fileName}，可先预览再生成导入基线草稿。`)
    } catch (error) {
      setImportPreview(null)
      setImportError(getApiErrorMessage(error, '导入文件解析失败，请检查表头和日期格式。'))
    } finally {
      setImportParsing(false)
      input.value = ''
    }
  }, [])

  const handleCreateImportedBaseline = useCallback(async () => {
    if (!projectId || !importPreview) return
    setActionLoading('save')
    try {
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
      await loadBaselineContext({ preferredId: created.id })
      setImportPreview(null)
      setImportError(null)
      setStatusNotice(`已从 ${importPreview.fileName} 生成导入基线草稿。`)
    } catch (error) {
      toast({
        title: '导入基线失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }, [currentProject?.name, importPreview, loadBaselineContext, projectId, toast])

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
    editorItems,
    handleDraftChange,
    handleInputKeyDown,
    inputDrafts,
    normalizedSelectedItemIds,
    readOnly,
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
  const revisionCandidates = useMemo<BaselineRevisionCandidate[]>(() => {
    if (diffItems.length > 0) {
      return diffItems.slice(0, 6).map((item) => ({
        id: `baseline-revision-${item.id}`,
        title: item.title,
        summary: item.note ?? `${item.before} → ${item.after}`,
        source: `来自${item.kind}差异`,
        tag: item.kind,
      }))
    }

    return editorItems.slice(0, 6).map((item) => ({
      id: `baseline-revision-item-${item.id}`,
      title: item.title,
      summary: describeBaselineItem(item),
      source: '来自当前基线结构',
      tag: item.is_milestone ? '里程碑' : item.is_critical ? '关键路径' : '基线条目',
    }))
  }, [diffItems, editorItems])
  useEffect(() => {
    if (!revisionCandidates.length) {
      setRevisionActiveCandidateId(null)
      setRevisionBasketIds([])
      setRevisionDeferredCandidateIds([])
      setRevisionDeferredReason('')
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
    if (diffItems.some((item) => item.kind === '里程碑变动' || item.kind === '移除')) return '高优先级'
    return '待整理'
  }, [diffItems, revisionCandidates.length])
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
    setStatusNotice(`已把“${revisionActiveCandidate.title}”标记为暂不处理。`)
  }, [revisionActiveCandidate])

  const handleRevisionEnterDraft = useCallback(() => {
    setRevisionPoolOpen(false)
    setStatusNotice('已带着修订候选回到基线草稿，可继续在当前树表中处理。')
  }, [])

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
      const detail = await apiGet<BaselineDetail>(`/api/task-baselines/${nextCompareId}`)
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
      if (tab.key === 'monthly') {
        navigateWithGuard(`/projects/${projectId}/planning/monthly`)
        return
      }
      if (tab.key === 'revision-pool') {
        navigateWithGuard(`/projects/${projectId}/planning/revision-pool`)
        return
      }
      if (tab.key === 'change-log') {
        navigateWithGuard(`/projects/${projectId}/reports?view=change_log`)
        return
      }
      navigateWithGuard(`/projects/${projectId}/reports`)
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
    return (
      <PlanningPageShell
        projectName={currentProject?.name ?? '项目'}
        title="基线编辑"
        description="当前项目还没有正式基线，先选择首版编制入口，再进入标准校核链路。"
        tabs={tabs}
      >
        {statusNotice ? (
          <Alert className="mb-4" data-testid="baseline-status-notice">
            <AlertDescription>{statusNotice}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <Card data-testid="baseline-entry-selector" className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">首版基线创建入口</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <button
                type="button"
                data-testid="baseline-entry-blank"
                onClick={() => setStatusNotice('已选择“新建空白基线”，后续将从空白骨架开始编制。')}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-slate-300"
              >
                <div className="text-sm font-medium text-slate-900">新建空白基线</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  从空白范围开始梳理主骨架，适合先搭版本框架。
                </p>
              </button>
              <button
                type="button"
                data-testid="baseline-entry-schedule"
                onClick={() => setStatusNotice('已选择“从当前排期生成”，后续会按真实任务排期组织首版基线。')}
                className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-4 text-left transition hover:border-cyan-300"
              >
                <div className="text-sm font-medium text-slate-900">从当前排期生成</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  先沿用现有任务排期，再在基线树里做筛选和冻结。
                </p>
              </button>
              <button
                type="button"
                data-testid="baseline-entry-import"
                onClick={() => importInputRef.current?.click()}
                className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-left transition hover:border-amber-300"
              >
                <div className="flex items-center justify-between gap-3 text-sm font-medium text-slate-900">
                  <span>导入计划文件</span>
                  <FileSpreadsheet className="h-4 w-4 text-amber-700" />
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  支持 .xlsx / .xls，先预览导入条目，再生成导入版基线草稿。
                </p>
              </button>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">下一步建议</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
              <p>先确定首版来源，再进入月计划、修订候选和变更记录的共享链路。</p>
              <div className="grid gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="justify-between"
                  onClick={() => navigateWithGuard(`/projects/${projectId}/planning/monthly`)}
                >
                  <span>先看月度计划壳子</span>
                  <Badge variant="outline">Monthly</Badge>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="justify-between"
                  onClick={() => navigateWithGuard(`/projects/${projectId}/planning/revision-pool`)}
                >
                  <span>查看修订候选</span>
                  <Badge variant="outline">Planning</Badge>
                </Button>
              </div>
            </CardContent>
          </Card>
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
            description="准备导入预览、映射日期和进度字段。"
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
              </div>
              <div className="space-y-2">
                {importPreview.rows.slice(0, 4).map((row) => (
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
                {importPreview.rows.length > 4 ? (
                  <div className="text-xs text-slate-500">其余 {importPreview.rows.length - 4} 项会在生成草稿后进入基线树继续校核。</div>
                ) : null}
                {importPreview.warnings.length > 0 ? (
                  <div className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-xs leading-5 text-amber-800">
                    {importPreview.warnings[0]}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void handleCreateImportedBaseline()} loading={actionLoading === 'save'}>
                  生成导入基线草稿
                </Button>
                <Button type="button" variant="outline" onClick={() => importInputRef.current?.click()}>
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
      title="基线编辑"
      description="围绕项目基线版本完成勾选、校核、确认与版本衔接。"
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
            >
              结束重排
            </Button>
          ) : null}
          {activeBaseline.status === 'draft' ? (
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
          <div data-testid="baseline-info-bar" className="grid gap-3 xl:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-500">版本对照</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-slate-700">
                <div className="text-lg font-semibold text-slate-900">{compareLabel} → {currentLabel}</div>
                <div>{currentLabel} · {formatStatusLabel(activeBaseline.status)} · {editorItems.length} 项</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-500">当前状态</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-slate-700">
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
                <div>{buildBaselineStatusNotice(activeBaseline.status, compareLabel)}</div>
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
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-500">映射完整性</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-700">
                <div className="text-lg font-semibold text-amber-700">
                  {mappingSummary.aligned} / {mappingSummary.total}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={filterMode === 'mapping_attention' ? 'default' : 'outline'}
                  onClick={() =>
                    setFilterMode((current) =>
                      current === 'mapping_attention' ? 'all' : 'mapping_attention',
                    )
                  }
                  data-testid="baseline-filter-mapping-attention"
                >
                  {mappingSummary.attention > 0
                    ? `${mappingSummary.attention} 项待补齐`
                    : '当前映射已全部对齐'}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-500">最近暂存</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-slate-700">
                <div className="text-lg font-semibold text-slate-900">
                  {activeBaseline.updated_at ?? '暂无'}
                </div>
                <div>当前视图 {filteredRows.length} 项</div>
                <div>已选 {normalizedSelectedItemIds.length} 项</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-500">修订与留痕</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-700">
                <div>共 {versions.length} 个版本</div>
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
                  >
                    <span className="flex items-center gap-2">
                      <History className="h-4 w-4" />
                      变更记录分析
                    </span>
                    <Badge variant="outline">Reports</Badge>
                  </Button>
                </div>
              </CardContent>
            </Card>
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
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      这里改成树下方可折叠面板，方便一边看基线树一边定位阻断项。
                    </p>
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
                <p className="text-sm leading-6 text-slate-600">
                  点击版本芯片可直接切换查看，当前差异摘要会基于所选版本重算。
                </p>
                <div className="flex flex-wrap gap-2">
                  {versions.map((version) => (
                    <Button
                      key={version.id}
                      type="button"
                      size="sm"
                      variant={activeBaseline.id === version.id ? 'default' : 'outline'}
                      data-testid={`baseline-version-chip-${version.id}`}
                      onClick={() => void loadBaselineContext({ preferredId: version.id })}
                      disabled={actionLoading !== null && activeBaseline.id === version.id}
                    >
                      v{version.version} · {formatStatusLabel(version.status)}
                    </Button>
                  ))}
                </div>
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
                      <p className="text-xs leading-5 text-slate-500">
                        当前先预览前 3 条差异，完整清单可在确认发布里继续查看。
                      </p>
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
                    <div className="mt-3 text-xs leading-5 text-slate-500">
                      当前先用版本差异预览兜底。如果后端已经落了 baseline change log，这里会自动消费最近留痕。
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">版本侧栏</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-slate-600">{compareLabel} → {currentLabel}</div>
                <Button type="button" className="w-full" onClick={handleOpenConfirmDialog}>
                  <FileDiff className="mr-2 h-4 w-4" />
                  进入确认发布
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => navigateWithGuard(`/projects/${projectId}/planning/revision-pool`)}
                  data-testid="baseline-open-revision-pool"
                >
                  <FolderGit2 className="mr-2 h-4 w-4" />
                  打开计划修订候选
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => navigateWithGuard(`/projects/${projectId}/reports?view=change_log`)}
                  data-testid="baseline-open-change-log"
                >
                  <History className="mr-2 h-4 w-4" />
                  查看变更日志
                </Button>
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
        }}
        state={confirmState}
        failureCode={confirmFailure?.code ?? null}
        failureMessage={confirmFailure?.message ?? null}
        canConfirm={!confirmDisabledReason}
        confirmDisabledReason={confirmDisabledReason}
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
        basketItems={revisionBasketItems}
        activeCandidateId={revisionActiveCandidate?.id ?? null}
        deferredCandidateIds={revisionDeferredCandidateIds}
        deferredReason={revisionDeferredReason}
        deferredReasonVisible={revisionDeferredReasonVisible}
        onOpenChange={setRevisionPoolOpen}
        onSelectCandidate={setRevisionActiveCandidateId}
        onAddToBasket={handleRevisionAddToBasket}
        onMarkDeferred={handleRevisionMarkDeferred}
        onDeferredReasonChange={setRevisionDeferredReason}
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
