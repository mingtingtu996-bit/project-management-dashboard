import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, FileBadge2, Plus, RefreshCw, Search, Upload } from 'lucide-react'

import { Breadcrumb } from '@/components/Breadcrumb'
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { usePermissions } from '@/hooks/usePermissions'
import { useStore } from '@/hooks/useStore'
import { useToast } from '@/hooks/use-toast'
import { apiDelete, apiGet, apiPost, apiPut, getApiErrorMessage, isAbortError } from '@/lib/apiClient'
import { safeJsonParse, safeStorageGet, safeStorageSet } from '@/lib/browserStorage'
import { cn } from '@/lib/utils'

import {
  DRAWING_DISCIPLINE_OPTIONS,
  DRAWING_PURPOSE_OPTIONS,
  DRAWING_REVIEW_MODE_LABELS,
  DRAWING_STATUS_LABELS,
  DRAWING_TEMPLATES,
} from './constants'
import { DrawingDetailDrawer } from './components/DrawingDetailDrawer'
import { DrawingLedger } from './components/DrawingLedger'
import { DrawingPackageBoard, type DrawingPackageGroup } from './components/DrawingPackageBoard'
import { DrawingReadinessSummary, type DrawingReadinessMetrics } from './components/DrawingReadinessSummary'
import { DrawingVersionDialog } from './components/DrawingVersionDialog'
import type {
  DrawingBoardSummary,
  DrawingLedgerRow,
  DrawingPackageCard,
  DrawingPackageDetailView,
  DrawingSignalView,
  DrawingsBoardResponse,
  DrawingsLedgerResponse,
  DrawingVersionView,
  ReviewMode,
} from './types'

const API_BASE = ''

type DrawingFocusViewMode = 'overview' | 'missing' | 'review' | 'changes' | 'taskImpact' | 'acceptanceImpact'
type DrawingVersionFilter = 'all' | 'current' | 'history' | 'changed'
type SavedDrawingFilters = {
  searchQuery?: string
  disciplineFilter?: string
  purposeFilter?: string
  focusView?: DrawingFocusViewMode
  statusFilter?: string
  versionFilter?: DrawingVersionFilter
}

type ApiFailureEnvelope = {
  success: false
  error?: {
    message?: string
  } | null
}

interface CreatePackageFormState {
  templateCode: string
  packageCode: string
  packageName: string
  disciplineType: string
  documentPurpose: string
  reviewMode: ReviewMode
  reviewBasis: string
}

interface CreatePackageFormErrors {
  packageName?: string
  disciplineType?: string
  documentPurpose?: string
  form?: string
}

interface CreateDrawingVersionFormState {
  drawingName: string
  drawingCode: string
  versionNo: string
  changeReason: string
  isCurrentVersion: boolean
}

type DrawingReviewRuleRow = {
  id: string
  project_id: string | null
  package_code: string | null
  discipline_type: string | null
  document_purpose: string | null
  default_review_mode: ReviewMode
  review_basis: string | null
  reviewer_id?: string | null
  is_active: boolean | number | null
  created_at: string
  updated_at: string
}

type DrawingReviewRuleFormState = {
  packageCode: string
  disciplineType: string
  documentPurpose: string
  defaultReviewMode: ReviewMode
  reviewBasis: string
  reviewerId: string
  isActive: boolean
}

type DrawingReviewRulesResponse = {
  success?: boolean
  data?: {
    rules?: DrawingReviewRuleRow[]
  }
}

const emptyReviewRuleForm = (): DrawingReviewRuleFormState => ({
  packageCode: '',
  disciplineType: '',
  documentPurpose: '',
  defaultReviewMode: 'mandatory',
  reviewBasis: '',
  reviewerId: '',
  isActive: true,
})

function toReviewRuleForm(rule?: DrawingReviewRuleRow | null): DrawingReviewRuleFormState {
  if (!rule) return emptyReviewRuleForm()
  return {
    packageCode: rule.package_code || '',
    disciplineType: rule.discipline_type || '',
    documentPurpose: rule.document_purpose || '',
    defaultReviewMode: rule.default_review_mode || 'mandatory',
    reviewBasis: rule.review_basis || '',
    reviewerId: rule.reviewer_id || '',
    isActive: Boolean(rule.is_active),
  }
}

const reviewModeOptions: Array<{ value: ReviewMode; label: string }> = [
  { value: 'mandatory', label: '必须送审' },
  { value: 'optional', label: '可选送审' },
  { value: 'none', label: '不适用' },
  { value: 'manual_confirm', label: '人工确认' },
]

const emptyCreateForm = (): CreatePackageFormState => ({
  templateCode: DRAWING_TEMPLATES[0]?.templateCode ?? 'architecture-construction',
  packageCode: '',
  packageName: '',
  disciplineType: DRAWING_TEMPLATES[0]?.disciplineType ?? '',
  documentPurpose: DRAWING_TEMPLATES[0]?.documentPurpose ?? '',
  reviewMode: DRAWING_TEMPLATES[0]?.defaultReviewMode ?? 'none',
  reviewBasis: '',
})

function groupPackagesByDiscipline(packages: DrawingPackageCard[]): DrawingPackageGroup[] {
  const grouped = new Map<string, DrawingPackageCard[]>()
  packages.forEach((pkg) => {
    const bucket = grouped.get(pkg.disciplineType) ?? []
    bucket.push(pkg)
    grouped.set(pkg.disciplineType, bucket)
  })
  return Array.from(grouped.entries()).map(([disciplineType, groupPackages]) => ({
    disciplineType,
    packages: groupPackages,
  }))
}

function matchesText(value: string, query: string) {
  return value.toLowerCase().includes(query.toLowerCase())
}

function createSummaryFallback(): DrawingBoardSummary {
  return {
    totalPackages: 0,
    missingPackages: 0,
    mandatoryReviewPackages: 0,
    reviewingPackages: 0,
    scheduleImpactCount: 0,
    readyForConstructionCount: 0,
    readyForAcceptanceCount: 0,
  }
}

function buildDrawingSignalDescription(
  signal: DrawingSignalView,
  packageName?: string | null,
  packageId?: string | null,
) {
  return [
    signal.description,
    packageName ? `来源图纸包：${packageName}` : null,
    packageId ? `图纸包 ID：${packageId}` : null,
    signal.evidence.length > 0 ? `证据：${signal.evidence.join('；')}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

function isFailureEnvelope(value: unknown): value is ApiFailureEnvelope {
  return typeof value === 'object' && value !== null && 'success' in value && (value as { success?: unknown }).success === false
}

function getFailureMessage(value: unknown, fallback: string) {
  if (isFailureEnvelope(value) && value.error?.message) {
    return value.error.message
  }
  return fallback
}

function getFocusViewLabel(mode: DrawingFocusViewMode) {
  if (mode === 'missing') return '缺漏视图'
  if (mode === 'review') return '送审视图'
  if (mode === 'changes') return '变更视图'
  if (mode === 'taskImpact') return '任务影响视图'
  if (mode === 'acceptanceImpact') return '验收影响视图'
  return '概览'
}

const focusViewOptions: Array<{ value: DrawingFocusViewMode; label: string; description: string }> = [
  { value: 'overview', label: '概览', description: '查看全部图纸包和台账记录。' },
  { value: 'missing', label: '缺漏视图', description: '优先处理应有项未补齐的图纸包。' },
  { value: 'review', label: '送审视图', description: '聚焦必审、待审和修订中的图纸。' },
  { value: 'changes', label: '变更视图', description: '检查发生版本变更的图纸影响。' },
  { value: 'taskImpact', label: '任务影响视图', description: '只看已经关联施工任务的图纸包。' },
  { value: 'acceptanceImpact', label: '验收影响视图', description: '只看影响验收和归档的图纸包。' },
]

const statusFilterOptions = [
  { value: 'all', label: '全部状态' },
  ...Object.entries(DRAWING_STATUS_LABELS).map(([value, label]) => ({ value, label })),
]

const versionFilterOptions: Array<{ value: DrawingVersionFilter; label: string }> = [
  { value: 'all', label: '全部版本' },
  { value: 'current', label: '当前有效版' },
  { value: 'history', label: '历史版本' },
  { value: 'changed', label: '有变更' },
]

function isApprovedDrawing(row: DrawingLedgerRow) {
  return row.drawingStatus === 'issued' || row.drawingStatus === 'completed' || row.reviewStatus.includes('通过')
}

function isOverdueDrawing(row: DrawingLedgerRow) {
  if (isApprovedDrawing(row)) return false
  const dateValue = row.plannedPassDate || row.plannedSubmitDate
  if (!dateValue) return false
  const dueTime = new Date(dateValue).getTime()
  if (Number.isNaN(dueTime)) return false
  return dueTime < Date.now()
}

function escapeCsvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function isReviewFocusedPackage(pkg: DrawingPackageCard) {
  return pkg.requiresReview || pkg.reviewMode !== 'none' || pkg.status === 'reviewing'
}

export default function Drawings() {
  useEffect(() => {
    document.title = '施工图纸 | WorkBuddy'
  }, [])

  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { currentProject, projects } = useStore()
  const { toast } = useToast()
  const { canEdit } = usePermissions({ projectId: id ?? currentProject?.id })

  const projectName = currentProject?.name || projects.find((project) => project.id === id)?.name || '当前项目'
  const [board, setBoard] = useState<DrawingsBoardResponse | null>(null)
  const [ledgerRows, setLedgerRows] = useState<DrawingLedgerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState<DrawingPackageCard | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<DrawingPackageDetailView | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [versionDialogOpen, setVersionDialogOpen] = useState(false)
  const [versionPackage, setVersionPackage] = useState<DrawingPackageCard | null>(null)
  const [versionRows, setVersionRows] = useState<DrawingVersionView[]>([])
  const filterStorageKey = id ? `drawings-filter-${id}` : null
  const savedFilters = filterStorageKey
    ? safeJsonParse<SavedDrawingFilters>(
        safeStorageGet(sessionStorage, filterStorageKey),
        {},
        filterStorageKey,
      )
    : {}
  const [searchQuery, setSearchQuery] = useState<string>(savedFilters.searchQuery ?? '')
  const [disciplineFilter, setDisciplineFilter] = useState<string>(savedFilters.disciplineFilter ?? DRAWING_DISCIPLINE_OPTIONS[0] ?? '')
  const [purposeFilter, setPurposeFilter] = useState<string>(savedFilters.purposeFilter ?? DRAWING_PURPOSE_OPTIONS[0] ?? '')
  const [statusFilter, setStatusFilter] = useState<string>(savedFilters.statusFilter ?? 'all')
  const [versionFilter, setVersionFilter] = useState<DrawingVersionFilter>(savedFilters.versionFilter ?? 'all')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [creatingPackage, setCreatingPackage] = useState(false)
  const [createForm, setCreateForm] = useState<CreatePackageFormState>(emptyCreateForm)
  const [createFormErrors, setCreateFormErrors] = useState<CreatePackageFormErrors>({})
  const [focusView, setFocusView] = useState<DrawingFocusViewMode>(savedFilters.focusView ?? 'overview')
  const [reviewRulesDialogOpen, setReviewRulesDialogOpen] = useState(false)
  const [reviewRulesLoading, setReviewRulesLoading] = useState(false)
  const [reviewRulesSaving, setReviewRulesSaving] = useState(false)
  const [reviewRules, setReviewRules] = useState<DrawingReviewRuleRow[]>([])
  const [selectedReviewRuleId, setSelectedReviewRuleId] = useState<string | null>(null)
  const [pendingDeleteReviewRuleId, setPendingDeleteReviewRuleId] = useState<string | null>(null)
  const [reviewRuleForm, setReviewRuleForm] = useState<DrawingReviewRuleFormState>(emptyReviewRuleForm)
  const [reviewRuleFormError, setReviewRuleFormError] = useState('')
  const boardAbortRef = useRef<AbortController | null>(null)
  const ledgerAbortRef = useRef<AbortController | null>(null)
  const detailAbortRef = useRef<AbortController | null>(null)
  const versionAbortRef = useRef<AbortController | null>(null)

  const summary = board?.summary ?? createSummaryFallback()

  const loadBoard = useCallback(async () => {
    if (!id) return

    boardAbortRef.current?.abort()
    const controller = new AbortController()
    boardAbortRef.current = controller
    setLoading(true)

    try {
      const result = await apiGet<DrawingsBoardResponse | ApiFailureEnvelope>(
        `${API_BASE}/api/construction-drawings/board?projectId=${id}`,
        { signal: controller.signal, cache: 'no-store' },
      )

      if (controller.signal.aborted) return
      setBoard(isFailureEnvelope(result) ? null : result)
    } catch (error) {
      if (!isAbortError(error)) {
        console.error('Failed to load drawings board', error)
        setBoard(null)
        toast({ variant: 'destructive', title: '加载图纸数据失败' })
      }
    } finally {
      if (boardAbortRef.current === controller) {
        boardAbortRef.current = null
      }
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }, [id])

  const loadLedger = useCallback(async () => {
    if (!id) return

    ledgerAbortRef.current?.abort()
    const controller = new AbortController()
    ledgerAbortRef.current = controller

    try {
      const result = await apiGet<DrawingsLedgerResponse | ApiFailureEnvelope>(
        `${API_BASE}/api/construction-drawings/ledger?projectId=${id}`,
        { signal: controller.signal, cache: 'no-store' },
      )

      if (controller.signal.aborted) return
      setLedgerRows(isFailureEnvelope(result) ? [] : result.drawings ?? [])
    } catch (error) {
      if (!isAbortError(error)) {
        console.error('Failed to load drawings ledger', error)
        setLedgerRows([])
        toast({ variant: 'destructive', title: '加载图纸数据失败' })
      }
    } finally {
      if (ledgerAbortRef.current === controller) {
        ledgerAbortRef.current = null
      }
    }
  }, [id])

  const loadPackageDetail = useCallback(
    async (packageId: string) => {
      if (!id) return null

      detailAbortRef.current?.abort()
      const controller = new AbortController()
      detailAbortRef.current = controller
      setDetailLoading(true)

      try {
        const result = await apiGet<DrawingPackageDetailView | ApiFailureEnvelope>(
          `${API_BASE}/api/construction-drawings/packages/${packageId}/detail?projectId=${id}`,
          { signal: controller.signal, cache: 'no-store' },
        )

        if (controller.signal.aborted) return null
        return isFailureEnvelope(result) ? null : result
      } catch (error) {
        if (!isAbortError(error)) {
          console.error('Failed to load drawing package detail', error)
          toast({ variant: 'destructive', title: '加载图纸数据失败' })
        }
        return null
      } finally {
        if (detailAbortRef.current === controller) {
          detailAbortRef.current = null
        }
        if (!controller.signal.aborted) {
          setDetailLoading(false)
        }
      }
    },
    [id],
  )

  const loadVersionRows = useCallback(
    async (packageId: string) => {
      if (!id) return { packageCard: null, versions: [] as DrawingVersionView[] }

      versionAbortRef.current?.abort()
      const controller = new AbortController()
      versionAbortRef.current = controller

      try {
        const result = await apiGet<
          { package: DrawingPackageCard | null; versions: DrawingVersionView[] } | ApiFailureEnvelope
        >(`${API_BASE}/api/construction-drawings/packages/${packageId}/versions?projectId=${id}`, {
          signal: controller.signal,
          cache: 'no-store',
        })

        if (controller.signal.aborted) {
          return { packageCard: null, versions: [] }
        }

        if (isFailureEnvelope(result)) {
          return { packageCard: null, versions: [] }
        }

        return {
          packageCard: result.package ?? null,
          versions: result.versions ?? [],
        }
      } catch (error) {
        if (!isAbortError(error)) {
          console.error('Failed to load version rows', error)
          toast({ variant: 'destructive', title: '加载图纸数据失败' })
        }
        return { packageCard: null, versions: [] }
      } finally {
        if (versionAbortRef.current === controller) {
          versionAbortRef.current = null
        }
      }
    },
    [id],
  )

  const refreshAll = useCallback(async () => {
    await Promise.all([loadBoard(), loadLedger()])
  }, [loadBoard, loadLedger])

  const loadReviewRules = useCallback(async () => {
    if (!id) return

    setReviewRulesLoading(true)
    try {
      const result = await apiGet<DrawingReviewRulesResponse>(
        `${API_BASE}/api/drawing-review-rules?projectId=${encodeURIComponent(id)}`,
        { cache: 'no-store' },
      )
      setReviewRules(result.data?.rules ?? [])
    } catch (error) {
      if (!isAbortError(error)) {
        console.error('Failed to load drawing review rules', error)
        toast({
          title: '审图规则加载失败',
          description: getApiErrorMessage(error, '请稍后重试。'),
          variant: 'destructive',
        })
      }
    } finally {
      setReviewRulesLoading(false)
    }
  }, [id, toast])

  const beginCreateReviewRule = useCallback(() => {
    setSelectedReviewRuleId(null)
    setReviewRuleForm(emptyReviewRuleForm())
    setReviewRuleFormError('')
  }, [])

  const beginEditReviewRule = useCallback((rule: DrawingReviewRuleRow) => {
    setSelectedReviewRuleId(rule.id)
    setReviewRuleForm(toReviewRuleForm(rule))
    setReviewRuleFormError('')
  }, [])

  const handleSaveReviewRule = useCallback(async () => {
    if (!id) return

    const payload = {
      project_id: id,
      package_code: reviewRuleForm.packageCode.trim() || null,
      discipline_type: reviewRuleForm.disciplineType.trim() || null,
      document_purpose: reviewRuleForm.documentPurpose.trim() || null,
      default_review_mode: reviewRuleForm.defaultReviewMode,
      review_basis: reviewRuleForm.reviewBasis.trim() || null,
      reviewer_id: reviewRuleForm.reviewerId.trim() || null,
      is_active: reviewRuleForm.isActive,
    }

    if (reviewRuleForm.defaultReviewMode === 'mandatory' && !payload.reviewer_id) {
      const message = '必须送审规则需要关联审图人。'
      setReviewRuleFormError(message)
      toast({ title: '请先补全审图规则', description: message, variant: 'destructive' })
      return
    }

    setReviewRulesSaving(true)
    try {
      if (selectedReviewRuleId) {
        await apiPut(`${API_BASE}/api/drawing-review-rules/${selectedReviewRuleId}`, payload)
      } else {
        await apiPost(`${API_BASE}/api/drawing-review-rules`, payload)
      }

      setSelectedReviewRuleId(null)
      setReviewRuleForm(emptyReviewRuleForm())
      setReviewRuleFormError('')
      await Promise.all([loadReviewRules(), refreshAll()])
      toast({
        title: selectedReviewRuleId ? '审图规则已更新' : '审图规则已创建',
        description: '规则列表已同步刷新。',
      })
    } catch (error) {
      const message = getApiErrorMessage(error, '请稍后重试。')
      setReviewRuleFormError(message)
      toast({
        title: selectedReviewRuleId ? '审图规则更新失败' : '审图规则创建失败',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setReviewRulesSaving(false)
    }
  }, [id, loadReviewRules, refreshAll, reviewRuleForm, selectedReviewRuleId, toast])

  const handleDeleteReviewRule = useCallback((ruleId: string) => {
    setPendingDeleteReviewRuleId(ruleId)
  }, [])

  const confirmDeleteReviewRule = useCallback(async () => {
    if (!id || !pendingDeleteReviewRuleId || reviewRulesSaving) return

    setReviewRulesSaving(true)
    try {
      await apiDelete(`${API_BASE}/api/drawing-review-rules/${pendingDeleteReviewRuleId}?projectId=${encodeURIComponent(id)}`, {
        headers: { 'Content-Type': 'application/json' },
      })
      if (selectedReviewRuleId === pendingDeleteReviewRuleId) {
        beginCreateReviewRule()
      }
      await Promise.all([loadReviewRules(), refreshAll()])
      toast({ title: '审图规则已删除', description: '规则列表已同步刷新。' })
    } catch (error) {
      toast({
        title: '审图规则删除失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setReviewRulesSaving(false)
      setPendingDeleteReviewRuleId(null)
    }
  }, [beginCreateReviewRule, id, loadReviewRules, pendingDeleteReviewRuleId, refreshAll, reviewRulesSaving, selectedReviewRuleId, toast])

  const refreshSelectedDetail = useCallback(async () => {
    const packageId = selectedDetail?.package.packageId ?? selectedPackage?.packageId
    if (!packageId) return null

    const detail = await loadPackageDetail(packageId)
    setSelectedDetail(detail)
    if (detail?.package) {
      setSelectedPackage(detail.package)
    }
    return detail
  }, [loadPackageDetail, selectedDetail?.package.packageId, selectedPackage?.packageId])

  useEffect(() => {
    void refreshAll()
  }, [id, refreshAll])

  useEffect(() => {
    return () => {
      boardAbortRef.current?.abort()
      ledgerAbortRef.current?.abort()
      detailAbortRef.current?.abort()
      versionAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (!reviewRulesDialogOpen) {
      setSelectedReviewRuleId(null)
      setReviewRuleForm(emptyReviewRuleForm())
      setReviewRuleFormError('')
      return
    }

    void loadReviewRules()
  }, [loadReviewRules, reviewRulesDialogOpen])

  useEffect(() => {
    if (!reviewRulesDialogOpen || !selectedReviewRuleId) return
    const selectedRule = reviewRules.find((rule) => rule.id === selectedReviewRuleId)
    if (selectedRule) {
      setReviewRuleForm(toReviewRuleForm(selectedRule))
    }
  }, [reviewRules, reviewRulesDialogOpen, selectedReviewRuleId])

  const filteredPackages = useMemo(() => {
    const packages = board?.packages ?? []
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return packages.filter((pkg) => {
      const matchesSearch =
        normalizedQuery.length === 0 ||
        matchesText(pkg.packageName, normalizedQuery) ||
        matchesText(pkg.packageCode, normalizedQuery) ||
        matchesText(pkg.disciplineType, normalizedQuery) ||
        matchesText(pkg.currentVersionLabel, normalizedQuery)
      const matchesDiscipline = disciplineFilter === (DRAWING_DISCIPLINE_OPTIONS[0] ?? '') || pkg.disciplineType === disciplineFilter
      const matchesPurpose = purposeFilter === (DRAWING_PURPOSE_OPTIONS[0] ?? '') || pkg.documentPurpose === purposeFilter
      const matchesStatus = statusFilter === 'all' || pkg.status === statusFilter
      const matchesVersion =
        versionFilter === 'all' || versionFilter === 'current' || versionFilter === 'history' || (versionFilter === 'changed' && pkg.hasChange)

      return matchesSearch && matchesDiscipline && matchesPurpose && matchesStatus && matchesVersion
    })
  }, [board?.packages, disciplineFilter, purposeFilter, searchQuery, statusFilter, versionFilter])

  const filteredLedgerRows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return ledgerRows.filter((row) => {
      const matchesSearch =
        normalizedQuery.length === 0 ||
        matchesText(row.packageName, normalizedQuery) ||
        matchesText(row.packageCode, normalizedQuery) ||
        matchesText(row.drawingName, normalizedQuery) ||
        matchesText(row.drawingCode, normalizedQuery)
      const matchesDiscipline = disciplineFilter === (DRAWING_DISCIPLINE_OPTIONS[0] ?? '') || row.disciplineType === disciplineFilter
      const matchesPurpose = purposeFilter === (DRAWING_PURPOSE_OPTIONS[0] ?? '') || row.documentPurpose === purposeFilter
      const matchesStatus = statusFilter === 'all' || row.drawingStatus === statusFilter
      const matchesVersion =
        versionFilter === 'all' ||
        (versionFilter === 'current' && row.isCurrentVersion) ||
        (versionFilter === 'history' && !row.isCurrentVersion) ||
        (versionFilter === 'changed' && row.hasChange)

      return matchesSearch && matchesDiscipline && matchesPurpose && matchesStatus && matchesVersion
    })
  }, [disciplineFilter, ledgerRows, purposeFilter, searchQuery, statusFilter, versionFilter])

  const focusedPackages = useMemo(() => {
    if (focusView === 'missing') {
      return filteredPackages.filter((pkg) => pkg.missingRequiredCount > 0)
    }
    if (focusView === 'review') {
      return filteredPackages.filter((pkg) => isReviewFocusedPackage(pkg))
    }
    if (focusView === 'changes') {
      return filteredPackages.filter((pkg) => pkg.hasChange)
    }
    if (focusView === 'taskImpact') {
      return [...filteredPackages]
        .filter((pkg) => (pkg.linkedTaskCount ?? 0) > 0)
        .sort((a, b) => (b.linkedTaskCount ?? 0) - (a.linkedTaskCount ?? 0))
    }
    if (focusView === 'acceptanceImpact') {
      return [...filteredPackages]
        .filter((pkg) => (pkg.linkedAcceptanceCount ?? 0) > 0)
        .sort((a, b) => (b.linkedAcceptanceCount ?? 0) - (a.linkedAcceptanceCount ?? 0))
    }
    return filteredPackages
  }, [filteredPackages, focusView])

  const focusedLedgerRows = useMemo(() => {
    if (focusView === 'overview') {
      return filteredLedgerRows
    }

    const packageIds = new Set(focusedPackages.map((pkg) => pkg.packageId))
    return filteredLedgerRows.filter((row) => packageIds.has(row.packageId))
  }, [filteredLedgerRows, focusedPackages, focusView])

  const packageGroups = useMemo(() => groupPackagesByDiscipline(focusedPackages), [focusedPackages])
  const readinessMetrics = useMemo<DrawingReadinessMetrics>(() => {
    const packageRows = board?.packages ?? []
    const drawingTotalFallback = packageRows.reduce((total, pkg) => total + (pkg.drawingsCount || 0), 0)
    const totalDrawings = ledgerRows.length || drawingTotalFallback || summary.totalPackages
    const approvedDrawings = ledgerRows.length
      ? ledgerRows.filter(isApprovedDrawing).length
      : packageRows.filter((pkg) => pkg.isReadyForConstruction || pkg.isReadyForAcceptance).length
    const pendingReviewDrawings = ledgerRows.length
      ? ledgerRows.filter((row) => row.requiresReview && !isApprovedDrawing(row)).length
      : summary.reviewingPackages
    const overdueDrawings = ledgerRows.length
      ? ledgerRows.filter(isOverdueDrawing).length
      : summary.scheduleImpactCount

    const disciplineMap = new Map<string, { total: number; ready: number; overdue: number }>()
    if (ledgerRows.length) {
      ledgerRows.forEach((row) => {
        const current = disciplineMap.get(row.disciplineType) ?? { total: 0, ready: 0, overdue: 0 }
        current.total += 1
        if (isApprovedDrawing(row)) current.ready += 1
        if (isOverdueDrawing(row)) current.overdue += 1
        disciplineMap.set(row.disciplineType, current)
      })
    } else {
      packageRows.forEach((pkg) => {
        const current = disciplineMap.get(pkg.disciplineType) ?? { total: 0, ready: 0, overdue: 0 }
        current.total += pkg.drawingsCount || 1
        if (pkg.isReadyForConstruction || pkg.isReadyForAcceptance) {
          current.ready += pkg.drawingsCount || 1
        }
        if (pkg.scheduleImpactFlag) current.overdue += 1
        disciplineMap.set(pkg.disciplineType, current)
      })
    }

    return {
      totalDrawings,
      approvedDrawings,
      pendingReviewDrawings,
      overdueDrawings,
      plannedSubmitThisMonthCount: summary.plannedSubmitThisMonthCount ?? 0,
      reviewingPackages: summary.reviewingPackages,
      scheduleImpactCount: summary.scheduleImpactCount,
      disciplineReadiness: Array.from(disciplineMap.entries())
        .map(([disciplineType, item]) => ({
          disciplineType,
          total: item.total,
          ready: item.ready,
          overdue: item.overdue,
          ratio: item.total > 0 ? Math.round((item.ready / item.total) * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8),
    }
  }, [board?.packages, ledgerRows, summary])

  const boardTitle = getFocusViewLabel(focusView)
  const boardSubtitle = ''

  const handleExportLedger = useCallback(() => {
    const header = ['图纸名称', '图纸编号', '专业', '版本', '状态', '审批人', '日期']
    const rows = focusedLedgerRows.map((row) => [
      row.drawingName,
      row.drawingCode,
      row.disciplineType,
      row.versionNo,
      DRAWING_STATUS_LABELS[row.drawingStatus] ?? row.drawingStatus,
      row.designPerson || row.reviewUnit || '',
      row.actualPassDate || row.plannedPassDate || row.actualSubmitDate || row.plannedSubmitDate || row.createdAt || '',
    ])
    const csv = [header, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `drawings-ledger-${id ?? 'project'}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [focusedLedgerRows, id])

  const openPackageDetail = useCallback(
    async (pkg: DrawingPackageCard) => {
      setSelectedPackage(pkg)
      setSelectedDetail(null)
      setDrawerOpen(true)
      const detail = await loadPackageDetail(pkg.packageId)
      setSelectedDetail(detail)
      if (detail?.package) {
        setSelectedPackage(detail.package)
      }
    },
    [loadPackageDetail],
  )

  const openVersionWindow = useCallback(
    async (pkg: DrawingPackageCard) => {
      const result = await loadVersionRows(pkg.packageId)
      setVersionPackage(result.packageCard ?? pkg)
      setVersionRows(result.versions)
      setVersionDialogOpen(true)
    },
    [loadVersionRows],
  )

  const openVersionWindowFromRow = useCallback(
    async (row: DrawingLedgerRow) => {
      const target = board?.packages.find((pkg) => pkg.packageId === row.packageId || pkg.packageCode === row.packageCode)
      if (target) {
        await openVersionWindow(target)
        return
      }

      const result = await loadVersionRows(row.packageId)
      setVersionPackage(result.packageCard)
      setVersionRows(result.versions)
      setVersionDialogOpen(true)
    },
    [board?.packages, loadVersionRows, openVersionWindow],
  )

  const handleSetCurrentVersion = useCallback(
    async (versionId: string) => {
      const packageId = selectedDetail?.package.packageId ?? selectedPackage?.packageId ?? versionPackage?.packageId
      if (!packageId) return

      try {
        const result = await apiPost<unknown | ApiFailureEnvelope>(
          `${API_BASE}/api/construction-drawings/packages/${packageId}/set-current-version`,
          { versionId },
        )

        if (isFailureEnvelope(result)) {
          toast({
            title: '更新失败',
            description: getFailureMessage(result, '请稍后再试。'),
            variant: 'destructive',
          })
          return
        }

        toast({
          title: '当前有效版已更新',
          description: '图纸包详情和版本窗口已经同步刷新。',
        })

        await refreshAll()

        const [detail, latestVersion] = await Promise.all([
          loadPackageDetail(packageId),
          loadVersionRows(packageId),
        ])

        setSelectedDetail(detail)
        if (detail?.package) {
          setSelectedPackage(detail.package)
        }
        setVersionPackage(latestVersion.packageCard ?? versionPackage)
        setVersionRows(latestVersion.versions)
      } catch (error) {
        console.error('Failed to set current version', error)
        toast({
          title: '更新失败',
          description: getApiErrorMessage(error, '网络或服务异常，请稍后再试。'),
          variant: 'destructive',
        })
      }
    },
    [
      loadPackageDetail,
      loadVersionRows,
      refreshAll,
      selectedDetail?.package.packageId,
      selectedPackage?.packageId,
      toast,
      versionPackage,
    ],
  )

  const handleCreateVersion = useCallback(
    async (draft: CreateDrawingVersionFormState) => {
      if (!id) return false

      const packageCard = versionPackage ?? selectedDetail?.package ?? selectedPackage
      if (!packageCard) {
        toast({
          title: '新版本创建失败',
          description: '当前未选中图纸包，请先重新打开版本窗口。',
          variant: 'destructive',
        })
        return false
      }

      try {
        const result = await apiPost<unknown | ApiFailureEnvelope>(`${API_BASE}/api/construction-drawings`, {
          project_id: id,
          package_id: packageCard.packageId,
          package_code: packageCard.packageCode,
          package_name: packageCard.packageName,
          discipline_type: packageCard.disciplineType,
          document_purpose: packageCard.documentPurpose,
          drawing_name: draft.drawingName,
          drawing_code: draft.drawingCode || null,
          drawing_type: packageCard.disciplineType,
          version_no: draft.versionNo,
          version: draft.versionNo,
          issued_for: packageCard.documentPurpose,
          change_reason: draft.changeReason || `新增版本 v${draft.versionNo}`,
          parent_drawing_id: packageCard.currentVersionDrawingId,
          is_current_version: draft.isCurrentVersion,
          requires_review: packageCard.requiresReview,
          review_mode: packageCard.reviewMode,
          review_basis: packageCard.reviewBasis,
          review_status: '未提交',
          has_change: true,
          status: '编制中',
        })

        if (isFailureEnvelope(result)) {
          toast({
            title: '新版本创建失败',
            description: getFailureMessage(result, '请稍后再试。'),
            variant: 'destructive',
          })
          return false
        }

        toast({
          title: '新版本已创建',
          description: draft.isCurrentVersion ? '版本快照已生成，并已切换为当前有效版。' : '版本快照已生成，可继续在窗口中切换当前有效版。',
        })

        await refreshAll()

        const [detail, latestVersion] = await Promise.all([
          loadPackageDetail(packageCard.packageId),
          loadVersionRows(packageCard.packageId),
        ])

        const nextPackage = detail?.package ?? latestVersion.packageCard ?? packageCard
        setSelectedDetail(detail)
        setSelectedPackage(nextPackage)
        setVersionPackage(nextPackage)
        setVersionRows(latestVersion.versions)
        return true
      } catch (error) {
        console.error('Failed to create drawing version', error)
        toast({
          title: '新版本创建失败',
          description: getApiErrorMessage(error, '网络或服务异常，请稍后再试。'),
          variant: 'destructive',
        })
        return false
      }
    },
    [id, loadPackageDetail, loadVersionRows, refreshAll, selectedDetail?.package, selectedPackage, toast, versionPackage],
  )

  const createManualIssue = useCallback(
    async (signal: DrawingSignalView) => {
      if (!id) return

      try {
        const packageId = selectedDetail?.package.packageId ?? selectedPackage?.packageId ?? null
        const packageName = selectedDetail?.package.packageName ?? selectedPackage?.packageName ?? null

        const result = await apiPost<unknown | ApiFailureEnvelope>(`${API_BASE}/api/issues`, {
          project_id: id,
          title: signal.title,
          description: buildDrawingSignalDescription(signal, packageName, packageId),
          source_type: 'manual',
          source_id: packageId,
          source_entity_type: packageId ? 'drawing_package' : null,
          source_entity_id: packageId,
          severity:
            signal.severity === 'critical'
              ? 'critical'
              : signal.severity === 'high'
                ? 'high'
                : signal.severity === 'medium'
                  ? 'medium'
                  : 'low',
          priority:
            signal.severity === 'critical'
              ? 90
              : signal.severity === 'high'
                ? 80
                : signal.severity === 'medium'
                  ? 60
                  : 40,
          pending_manual_close: false,
          status: 'open',
        })

        if (isFailureEnvelope(result)) {
          toast({
            title: '问题升级失败',
            description: getFailureMessage(result, '请稍后再试。'),
            variant: 'destructive',
          })
          return
        }

        toast({
          title: '问题已升级',
          description: '已通过问题中心创建问题记录。',
        })
        await refreshSelectedDetail()
      } catch (error) {
        console.error('Failed to create manual issue from drawing signal', error)
        toast({
          title: '问题升级失败',
          description: getApiErrorMessage(error, '网络或服务异常，请稍后再试。'),
          variant: 'destructive',
        })
      }
    },
    [
      id,
      refreshSelectedDetail,
      selectedDetail?.package.packageId,
      selectedDetail?.package.packageName,
      selectedPackage?.packageId,
      selectedPackage?.packageName,
      toast,
    ],
  )

  const createManualRisk = useCallback(
    async (signal: DrawingSignalView) => {
      if (!id) return

      try {
        const packageId = selectedDetail?.package.packageId ?? selectedPackage?.packageId ?? null
        const packageName = selectedDetail?.package.packageName ?? selectedPackage?.packageName ?? null
        const level =
          signal.severity === 'critical'
            ? 'critical'
            : signal.severity === 'high'
              ? 'high'
              : signal.severity === 'medium'
                ? 'medium'
                : 'low'
        const probability =
          signal.severity === 'critical' ? 85 : signal.severity === 'high' ? 70 : signal.severity === 'medium' ? 50 : 25
        const impact =
          signal.severity === 'critical' ? 90 : signal.severity === 'high' ? 75 : signal.severity === 'medium' ? 55 : 35

        const result = await apiPost<unknown | ApiFailureEnvelope>(`${API_BASE}/api/risks`, {
          project_id: id,
          title: signal.title,
          description: buildDrawingSignalDescription(signal, packageName, packageId),
          level,
          status: 'identified',
          probability,
          impact,
          mitigation: '请根据图纸联动结果核查任务、验收前置与工期影响。',
          risk_category: 'progress',
          source_type: 'manual',
          source_id: packageId,
          source_entity_type: packageId ? 'drawing_package' : null,
          source_entity_id: packageId,
        })

        if (isFailureEnvelope(result)) {
          toast({
            title: '风险升级失败',
            description: getFailureMessage(result, '请稍后再试。'),
            variant: 'destructive',
          })
          return
        }

        toast({
          title: '风险已升级',
          description: '已通过风险中心创建风险记录。',
        })
        await refreshSelectedDetail()
      } catch (error) {
        console.error('Failed to create manual risk from drawing signal', error)
        toast({
          title: '风险升级失败',
          description: getApiErrorMessage(error, '网络或服务异常，请稍后再试。'),
          variant: 'destructive',
        })
      }
    },
    [
      id,
      refreshSelectedDetail,
      selectedDetail?.package.packageId,
      selectedDetail?.package.packageName,
      selectedPackage?.packageId,
      selectedPackage?.packageName,
      toast,
    ],
  )

  const handleCreatePackage = useCallback(async () => {
    if (!id) return

    const nextErrors: CreatePackageFormErrors = {}
    if (!createForm.packageName.trim()) {
      nextErrors.packageName = '请填写图纸包名称。'
    }
    if (!createForm.disciplineType.trim()) {
      nextErrors.disciplineType = '请填写专业。'
    }
    if (!createForm.documentPurpose.trim()) {
      nextErrors.documentPurpose = '请填写用途 / 属性。'
    }

    setCreateFormErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      toast({
        title: '请先补全图纸包必填信息',
        variant: 'destructive',
      })
      return
    }

    setCreatingPackage(true)
    try {
      const result = await apiPost<unknown | ApiFailureEnvelope>(`${API_BASE}/api/construction-drawings/packages`, {
        projectId: id,
        packageCode: createForm.packageCode.trim() || undefined,
        packageName: createForm.packageName.trim(),
        disciplineType: createForm.disciplineType.trim(),
        documentPurpose: createForm.documentPurpose.trim(),
        templateCode: createForm.templateCode,
        reviewMode: createForm.reviewMode,
        reviewBasis: createForm.reviewBasis.trim(),
      })

      if (isFailureEnvelope(result)) {
        const failureMessage = getFailureMessage(result, '请检查输入项。')
        setCreateFormErrors((previous) => ({
          ...previous,
          form: failureMessage,
        }))
        toast({
          title: '创建失败',
          description: failureMessage,
          variant: 'destructive',
        })
        return
      }

      toast({
        title: '图纸包已创建',
        description: '模板和应有项已经同步生成。',
      })
      setCreateDialogOpen(false)
      setCreateForm(emptyCreateForm())
      setCreateFormErrors({})
      await refreshAll()
    } catch (error) {
      console.error('Failed to create drawing package', error)
      const failureMessage = getApiErrorMessage(error, '网络或服务异常，请稍后再试。')
      setCreateFormErrors((previous) => ({
        ...previous,
        form: failureMessage,
      }))
      toast({
        title: '创建失败',
        description: failureMessage,
        variant: 'destructive',
      })
    } finally {
      setCreatingPackage(false)
    }
  }, [createForm, id, refreshAll, toast])

  const loadingSkeleton = (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <Card key={item} className="border-slate-200 shadow-sm">
            <CardContent className="space-y-3 p-5">
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="h-8 w-24 rounded-full" />
              <Skeleton className="h-10 w-full rounded-2xl" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="space-y-3 p-5">
          <Skeleton className="h-5 w-40 rounded-full" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </CardContent>
      </Card>
    </div>
  )

  return (
    <div className="page-shell" data-testid="drawings-page">
      <Breadcrumb
        items={[
          { label: projectName, href: `/projects/${id}/dashboard` },
          { label: '施工图纸' },
        ]}
      />

      <PageHeader
        eyebrow="专项管理"
        title="施工图纸"
      >
        <Button variant="ghost" size="sm" onClick={() => {
          if (filterStorageKey) {
            safeStorageSet(
              sessionStorage,
              filterStorageKey,
              JSON.stringify({ searchQuery, disciplineFilter, purposeFilter, focusView, statusFilter, versionFilter }),
            )
          }
          navigate(`/projects/${id}/pre-milestones`)
        }}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回前期证照
        </Button>
        <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(true)} disabled={!canEdit}>
          <Plus className="mr-2 h-4 w-4" />
          新建图纸包
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setReviewRulesDialogOpen(true)
            beginCreateReviewRule()
          }}
          disabled={!canEdit}
        >
          <FileBadge2 className="mr-2 h-4 w-4" />
          审图规则管理
        </Button>
        <Button variant="outline" size="sm" onClick={() => void refreshAll()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          刷新
        </Button>
      </PageHeader>

      {loading ? (
        loadingSkeleton
      ) : (
        <div className="space-y-8">
          <DrawingReadinessSummary summary={summary} projectName={projectName} metrics={readinessMetrics} />

            <Card className="card-unified">
              <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(260px,1.6fr)_repeat(4,minmax(160px,0.8fr))]">
                <div className="space-y-2">
                  <Label htmlFor="drawing-search" className="text-xs text-slate-500">
                    搜索
                  </Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input
                      id="drawing-search"
                      data-testid="drawings-search-input"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      aria-label="搜索图纸包或图纸"
                      placeholder="搜索包名、包号、图纸名、图号或版本号"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="discipline-filter" className="text-xs text-slate-500">
                    专业
                  </Label>
                  <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
                    <SelectTrigger id="discipline-filter" data-testid="drawing-discipline-select">
                      <SelectValue placeholder="选择专业" />
                    </SelectTrigger>
                    <SelectContent align="start" side="bottom">
                      {DRAWING_DISCIPLINE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status-filter" className="text-xs text-slate-500">
                    状态
                  </Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger id="status-filter" data-testid="drawing-status-select">
                      <SelectValue placeholder="选择状态" />
                    </SelectTrigger>
                    <SelectContent align="start" side="bottom">
                      {statusFilterOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="version-filter" className="text-xs text-slate-500">
                    版本
                  </Label>
                  <Select value={versionFilter} onValueChange={(value) => setVersionFilter(value as DrawingVersionFilter)}>
                    <SelectTrigger id="version-filter" data-testid="drawing-version-select">
                      <SelectValue placeholder="选择版本" />
                    </SelectTrigger>
                    <SelectContent align="start" side="bottom">
                      {versionFilterOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="focus-view-filter" className="text-xs text-slate-500">
                    Focus View
                  </Label>
                  <Select value={focusView} onValueChange={(value) => setFocusView(value as DrawingFocusViewMode)}>
                    <SelectTrigger id="focus-view-filter" data-testid="drawing-focus-select">
                      <SelectValue placeholder="选择视图" />
                    </SelectTrigger>
                    <SelectContent align="start" side="bottom" className="w-72">
                      {focusViewOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value} textValue={option.label} className="py-2">
                          <span className="flex flex-col items-start gap-0.5">
                            <span>{option.label}</span>
                            <span className="text-xs text-slate-500">{option.description}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 lg:col-span-5">
                  <Label htmlFor="purpose-filter" className="text-xs text-slate-500">
                    用途 / 属性
                  </Label>
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <Select value={purposeFilter} onValueChange={setPurposeFilter}>
                      <SelectTrigger id="purpose-filter" className="xl:max-w-xs" data-testid="drawing-purpose-select">
                        <SelectValue placeholder="选择用途" />
                      </SelectTrigger>
                      <SelectContent align="start" side="bottom">
                        {DRAWING_PURPOSE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex flex-wrap gap-2">
                      {focusViewOptions.map((option) => (
                        <Button
                          key={option.value}
                          variant={focusView === option.value ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setFocusView(option.value)}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(true)} disabled={!canEdit}>
                        <Upload className="mr-2 h-4 w-4" />
                        上传
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleExportLedger} disabled={focusedLedgerRows.length === 0}>
                        <Download className="mr-2 h-4 w-4" />
                        导出
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <DrawingPackageBoard
              groups={packageGroups}
              onSelectPackage={(pkg) => void openPackageDetail(pkg)}
              onOpenVersions={(pkg) => void openVersionWindow(pkg)}
              title={boardTitle}
              subtitle={boardSubtitle}
              emptyTitle={focusView === 'overview' ? '当前没有图纸包' : `${boardTitle}暂无数据`}
              emptyDescription=""
            />

            <DrawingLedger
              drawings={focusedLedgerRows}
              totalCount={ledgerRows.length}
              onSelectRow={(row) => {
                const pkg = board?.packages.find((item) => item.packageId === row.packageId || item.packageCode === row.packageCode)
                if (pkg) {
                  void openPackageDetail(pkg)
                }
              }}
              onOpenVersions={(row) => void openVersionWindowFromRow(row)}
              onSetCurrentVersion={canEdit ? (row) => void handleSetCurrentVersion(row.drawingId) : undefined}
            />
        </div>
      )}

      <DrawingDetailDrawer
        open={drawerOpen}
        detail={detailLoading ? null : selectedDetail}
        onOpenChange={(open) => {
          setDrawerOpen(open)
          if (!open) {
            setSelectedPackage(null)
            setSelectedDetail(null)
          }
        }}
        onOpenVersions={() => {
          if (selectedPackage) {
            void openVersionWindow(selectedPackage)
          }
        }}
        onSetCurrentVersion={(versionId) => {
          if (!canEdit) return
          void handleSetCurrentVersion(versionId)
        }}
        onAddDrawing={canEdit ? () => {
          if (selectedPackage) {
            void openVersionWindow(selectedPackage)
          }
        } : undefined}
        onCreateIssue={canEdit ? (signal) => void createManualIssue(signal) : undefined}
        onCreateRisk={canEdit ? (signal) => void createManualRisk(signal) : undefined}
        canEdit={canEdit}
      />

      <DrawingVersionDialog
        open={versionDialogOpen}
        packageCard={versionPackage}
        versions={versionRows}
        projectId={id}
        onOpenChange={setVersionDialogOpen}
        onSetCurrentVersion={canEdit ? (versionId) => void handleSetCurrentVersion(versionId) : () => {}}
        onCreateVersion={canEdit ? (draft) => handleCreateVersion(draft) : undefined}
        canEdit={canEdit}
      />

      <Dialog
        open={reviewRulesDialogOpen}
        onOpenChange={(open) => {
          setReviewRulesDialogOpen(open)
          if (!open) {
            beginCreateReviewRule()
          }
        }}
      >
        <DialogContent className="max-w-[720px] border-slate-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <FileBadge2 className="h-5 w-5" />
              审图规则管理
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              按专业、用途和图纸包编号维护项目审图规则，支持新增、编辑和删除。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">规则列表</div>
                    <div className="text-xs text-slate-500">当前项目下的可用规则</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      beginCreateReviewRule()
                      if (!reviewRulesDialogOpen) {
                        setReviewRulesDialogOpen(true)
                      }
                    }}
                    disabled={!canEdit}
                  >
                    新增规则
                  </Button>
                </div>

                <div className="max-h-[56vh] space-y-3 overflow-y-auto pr-1">
                  {reviewRulesLoading ? (
                    <>
                      {[1, 2, 3].map((item) => (
                        <div key={item} className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <Skeleton className="h-4 w-28 rounded-full" />
                          <Skeleton className="h-3 w-48 rounded-full" />
                          <Skeleton className="h-3.5 w-3.56 rounded-full" />
                        </div>
                      ))}
                    </>
                  ) : reviewRules.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                      暂无审图规则，可先新增一条。
                    </div>
                  ) : (
                    reviewRules.map((rule) => {
                      const isSelected = selectedReviewRuleId === rule.id
                      return (
                        <div
                          key={rule.id}
                          className={cn(
                            'rounded-2xl border p-3 transition-colors',
                            isSelected ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-white',
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">
                                {rule.discipline_type || '全部专业'}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {rule.package_code || '不限包号'} · {rule.document_purpose || '不限用途'}
                              </div>
                            </div>
                            <Badge variant={rule.is_active ? 'secondary' : 'outline'} className="shrink-0 rounded-full px-2 py-0.5">
                              {rule.is_active ? '启用' : '停用'}
                            </Badge>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant="outline" className="rounded-full px-2 py-0.5">
                              {DRAWING_REVIEW_MODE_LABELS[rule.default_review_mode]}
                            </Badge>
                            <Badge variant="outline" className="rounded-full px-2 py-0.5">
                              {rule.reviewer_id?.trim() ? `审图人 ${rule.reviewer_id.trim().slice(0, 12)}` : '未关联审图人'}
                            </Badge>
                            <Badge variant="outline" className="rounded-full px-2 py-0.5">
                              {rule.review_basis?.trim() ? rule.review_basis.trim().slice(0, 18) : '无依据'}
                            </Badge>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => beginEditReviewRule(rule)}
                              disabled={reviewRulesSaving}
                            >
                              编辑
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteReviewRule(rule.id)}
                              disabled={reviewRulesSaving}
                            >
                              删除
                            </Button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {selectedReviewRuleId ? '编辑审图规则' : '新增审图规则'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {selectedReviewRuleId ? '修改后会立即覆盖当前规则。' : '先填一条规则，再按需调整。'}
                    </div>
                  </div>
                  {selectedReviewRuleId ? (
                    <Button variant="ghost" size="sm" onClick={beginCreateReviewRule}>
                      取消编辑
                    </Button>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="review-rule-package-code">图纸包编号</Label>
                    <Input
                      id="review-rule-package-code"
                      value={reviewRuleForm.packageCode}
                      onChange={(event) => {
                        setReviewRuleFormError('')
                        setReviewRuleForm((current) => ({ ...current, packageCode: event.target.value }))
                      }}
                      placeholder="可留空，支持全包规则"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="review-rule-discipline">专业</Label>
                    <Input
                      id="review-rule-discipline"
                      value={reviewRuleForm.disciplineType}
                      onChange={(event) => {
                        setReviewRuleFormError('')
                        setReviewRuleForm((current) => ({ ...current, disciplineType: event.target.value }))
                      }}
                      placeholder="例如：建筑、结构、消防"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="review-rule-purpose">用途 / 属性</Label>
                    <Input
                      id="review-rule-purpose"
                      value={reviewRuleForm.documentPurpose}
                      onChange={(event) => {
                        setReviewRuleFormError('')
                        setReviewRuleForm((current) => ({ ...current, documentPurpose: event.target.value }))
                      }}
                      placeholder="例如：施工执行、送审报批"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="review-rule-mode">默认审图方式</Label>
                    <Select
                      value={reviewRuleForm.defaultReviewMode}
                      onValueChange={(value) => {
                        setReviewRuleFormError('')
                        setReviewRuleForm((current) => ({ ...current, defaultReviewMode: value as ReviewMode }))
                      }}
                    >
                      <SelectTrigger id="review-rule-mode">
                        <SelectValue placeholder="选择默认审图方式" />
                      </SelectTrigger>
                      <SelectContent align="start" side="bottom">
                        {reviewModeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="review-rule-basis">判定依据</Label>
                    <Textarea
                      id="review-rule-basis"
                      value={reviewRuleForm.reviewBasis}
                      onChange={(event) => {
                        setReviewRuleFormError('')
                        setReviewRuleForm((current) => ({ ...current, reviewBasis: event.target.value }))
                      }}
                      rows={4}
                      placeholder="可填写规范、图纸清单或专项要求。"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="review-rule-reviewer">审图人</Label>
                    <Input
                      id="review-rule-reviewer"
                      value={reviewRuleForm.reviewerId}
                      onChange={(event) => {
                        setReviewRuleFormError('')
                        setReviewRuleForm((current) => ({ ...current, reviewerId: event.target.value }))
                      }}
                      placeholder="填写审图人用户 ID；必审规则必填"
                    />
                  </div>

                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 md:col-span-2">
                    <Checkbox
                      checked={reviewRuleForm.isActive}
                      onCheckedChange={(checked) => {
                        setReviewRuleFormError('')
                        setReviewRuleForm((current) => ({ ...current, isActive: checked === true }))
                      }}
                    />
                    启用此规则
                  </label>
                </div>

                {reviewRuleFormError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {reviewRuleFormError}
                  </div>
                ) : null}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={beginCreateReviewRule} disabled={reviewRulesSaving}>
                    重置
                  </Button>
                  <Button onClick={() => void handleSaveReviewRule()} loading={reviewRulesSaving} disabled={!canEdit}>
                    保存规则
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open)
          if (!open) {
            setCreateFormErrors({})
          }
        }}
      >
        <DialogContent className="max-w-[560px] border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900">新建图纸包</DialogTitle>
            <DialogDescription className="sr-only">新建图纸包</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="templateCode">模板</Label>
              <Select
                value={createForm.templateCode}
                onValueChange={(value) => {
                  setCreateFormErrors((previous) => ({ ...previous, form: undefined }))
                  const nextTemplate = DRAWING_TEMPLATES.find((template) => template.templateCode === value) ?? DRAWING_TEMPLATES[0]
                  setCreateForm((previous) => ({
                    ...previous,
                    templateCode: nextTemplate?.templateCode ?? previous.templateCode,
                    disciplineType: nextTemplate?.disciplineType ?? previous.disciplineType,
                    documentPurpose: nextTemplate?.documentPurpose ?? previous.documentPurpose,
                    reviewMode: nextTemplate?.defaultReviewMode ?? previous.reviewMode,
                  }))
                }}
              >
                <SelectTrigger id="templateCode">
                  <SelectValue placeholder="选择模板" />
                </SelectTrigger>
                <SelectContent align="start" side="bottom">
                  {DRAWING_TEMPLATES.map((template) => (
                    <SelectItem key={template.templateCode} value={template.templateCode}>
                      {template.templateName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="packageName">图纸包名称</Label>
                <Input
                  id="packageName"
                  value={createForm.packageName}
                  onChange={(event) => {
                    setCreateFormErrors((previous) => ({ ...previous, packageName: undefined, form: undefined }))
                    setCreateForm((previous) => ({ ...previous, packageName: event.target.value }))
                  }}
                  placeholder="例如：结构施工图包"
                />
                {createFormErrors.packageName && <p className="text-xs text-red-600">{createFormErrors.packageName}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="packageCode">图纸包编号</Label>
                <Input
                  id="packageCode"
                  value={createForm.packageCode}
                  onChange={(event) => {
                    setCreateFormErrors((previous) => ({ ...previous, form: undefined }))
                    setCreateForm((previous) => ({ ...previous, packageCode: event.target.value }))
                  }}
                  placeholder="例如：pkg-structure"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="disciplineType">专业</Label>
                <Input
                  id="disciplineType"
                  value={createForm.disciplineType}
                  onChange={(event) => {
                    setCreateFormErrors((previous) => ({ ...previous, disciplineType: undefined, form: undefined }))
                    setCreateForm((previous) => ({ ...previous, disciplineType: event.target.value }))
                  }}
                />
                {createFormErrors.disciplineType && <p className="text-xs text-red-600">{createFormErrors.disciplineType}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="documentPurpose">用途 / 属性</Label>
                <Input
                  id="documentPurpose"
                  value={createForm.documentPurpose}
                  onChange={(event) => {
                    setCreateFormErrors((previous) => ({ ...previous, documentPurpose: undefined, form: undefined }))
                    setCreateForm((previous) => ({ ...previous, documentPurpose: event.target.value }))
                  }}
                />
                {createFormErrors.documentPurpose && <p className="text-xs text-red-600">{createFormErrors.documentPurpose}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reviewMode">送审要求</Label>
              <Select
                value={createForm.reviewMode}
                onValueChange={(value) => {
                  setCreateFormErrors((previous) => ({ ...previous, form: undefined }))
                  setCreateForm((previous) => ({ ...previous, reviewMode: value as ReviewMode }))
                }}
              >
                <SelectTrigger id="reviewMode">
                  <SelectValue placeholder="选择送审要求" />
                </SelectTrigger>
                <SelectContent align="start" side="bottom">
                  {reviewModeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reviewBasis">判定依据</Label>
              <Textarea
                id="reviewBasis"
                value={createForm.reviewBasis}
                onChange={(event) => {
                  setCreateFormErrors((previous) => ({ ...previous, form: undefined }))
                  setCreateForm((previous) => ({ ...previous, reviewBasis: event.target.value }))
                }}
                placeholder="可留空，默认按模板和规则自动判定。"
                rows={3}
              />
            </div>

            {createFormErrors.form && (
              <p className="text-xs text-red-600" data-testid="drawing-package-inline-error">
                {createFormErrors.form}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false)
                setCreateFormErrors({})
              }}
            >
              取消
            </Button>
            <Button onClick={() => void handleCreatePackage()} loading={creatingPackage} disabled={!canEdit}>
              创建图纸包
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog
        open={Boolean(pendingDeleteReviewRuleId)}
        onOpenChange={(open) => {
          if (!open && !reviewRulesSaving) setPendingDeleteReviewRuleId(null)
        }}
        title="删除审图规则"
        description="删除后这条审图规则将不再参与图纸包送审判定，规则列表会同步刷新。"
        confirmLabel={reviewRulesSaving ? '删除中...' : '删除规则'}
        cancelLabel="取消"
        confirmTone="destructive"
        testId="drawing-review-rule-delete-confirm"
        onConfirm={() => void confirmDeleteReviewRule()}
      />
    </div>
  )
}
