import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, FolderOpen, Plus, RefreshCw } from 'lucide-react'
import { Breadcrumb } from '@/components/Breadcrumb'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useStore } from '@/hooks/useStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useToast } from '@/hooks/use-toast'
import type {
  ApiResponse,
  CertificateBoardItem,
  CertificateBoardResponse,
  CertificateDetailResponse,
  CertificateLedgerResponse,
  CertificateSharedRibbonItem,
  CertificateStage,
  CertificateType,
  CertificateWorkItem,
  CertificateWorkItemFormData,
  ProjectOption,
} from './PreMilestones/types'
import {
  createEmptyWorkItemForm,
  getCertificateTypeLabel,
  mapCertificateStatusLabel,
} from './PreMilestones/constants'
import { LifecycleSummaryCards } from './PreMilestones/components/LifecycleSummaryCards'
import { CertificateSharedRibbon } from './PreMilestones/components/CertificateSharedRibbon'
import { FourCertificateBoard } from './PreMilestones/components/FourCertificateBoard'
import { CertificateLedger } from './PreMilestones/components/CertificateLedger'
import { CertificateDetailDrawer } from './PreMilestones/components/CertificateDetailDrawer'
import { CertificateWorkItemDialog } from './PreMilestones/components/CertificateWorkItemDialog'

const API_BASE = ''

function buildProjectOptions(currentProject?: { id?: string; name?: string } | null, projects: Array<{ id?: string; name?: string }> = []) {
  if (projects.length > 0) {
    return projects
      .filter((project) => project.id && project.name)
      .map((project) => ({ id: project.id as string, name: project.name as string }))
  }

  return currentProject?.id && currentProject?.name
    ? [{ id: currentProject.id, name: currentProject.name }]
    : []
}

function toIsoDate(value?: string | null) {
  if (!value) return null
  return String(value).slice(0, 10)
}

function isBeforeToday(value?: string | null) {
  const date = toIsoDate(value)
  if (!date) return false
  return date < new Date().toISOString().slice(0, 10)
}

function getCertificateLabel(type?: CertificateType | null) {
  return getCertificateTypeLabel(type)
}

function buildBoardUrl(projectId: string) {
  return `${API_BASE}/api/projects/${projectId}/pre-milestones/board`
}

function buildLedgerUrl(projectId: string) {
  return `${API_BASE}/api/projects/${projectId}/pre-milestones/ledger`
}

function buildDetailUrl(projectId: string, certificateId: string) {
  return `${API_BASE}/api/projects/${projectId}/pre-milestones/${certificateId}/detail`
}

function buildEscalationUrl(projectId: string, certificateId: string, target: 'issue' | 'risk') {
  return `${API_BASE}/api/projects/${projectId}/pre-milestones/${certificateId}/escalate-${target}`
}

function withFreshDataOptions(options?: RequestInit): RequestInit {
  return {
    ...(options ?? {}),
    cache: 'no-store',
  }
}

function buildFormFromItem(item: CertificateWorkItem | null, selectedCertificateId?: string | null): CertificateWorkItemFormData {
  if (!item) {
    const base = createEmptyWorkItemForm()
    return {
      ...base,
      certificate_ids: selectedCertificateId ? [selectedCertificateId] : [],
    }
  }

  return {
    item_code: item.item_code || '',
    item_name: item.item_name || '',
    item_stage: (item.item_stage as CertificateStage) || '资料准备',
    status: item.status || 'pending',
    planned_finish_date: item.planned_finish_date || '',
    actual_finish_date: item.actual_finish_date || '',
    approving_authority: item.approving_authority || '',
    is_shared: Boolean(item.is_shared),
    next_action: item.next_action || '',
    next_action_due_date: item.next_action_due_date || '',
    is_blocked: Boolean(item.is_blocked),
    block_reason: item.block_reason || '',
    sort_order: item.sort_order || 0,
    notes: item.notes || '',
    certificate_ids: item.certificate_ids || [],
  }
}

export default function PreMilestones() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentProject, projects } = useStore()
  const { canEdit } = usePermissions({ projectId: currentProject?.id })
  const { toast } = useToast()

  const projectOptions = useMemo<ProjectOption[]>(
    () => buildProjectOptions(currentProject as never, projects as never),
    [currentProject, projects]
  )

  const [selectedProjectId, setSelectedProjectId] = useState(currentProject?.id || '')
  const [board, setBoard] = useState<CertificateBoardResponse | null>(null)
  const [ledger, setLedger] = useState<CertificateLedgerResponse | null>(null)
  const [detail, setDetail] = useState<CertificateDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const selectedCertificateId = searchParams.get('cert') || null
  const selectedCertificateIdRef = useRef<string | null>(selectedCertificateId)

  useEffect(() => {
    selectedCertificateIdRef.current = selectedCertificateId
  }, [selectedCertificateId])

  const setSelectedCertificateId = useCallback((id: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (id) next.set('cert', id)
      else next.delete('cert')
      return next
    }, { replace: true })
  }, [setSearchParams])
  const [selectedWorkItemId, setSelectedWorkItemId] = useState<string | null>(null)
  const [hoveredWorkItemId, setHoveredWorkItemId] = useState<string | null>(null)
  const [hoveredCertificateType, setHoveredCertificateType] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingItem, setEditingItem] = useState<CertificateWorkItem | null>(null)
  const [formData, setFormData] = useState<CertificateWorkItemFormData>(() => createEmptyWorkItemForm())
  const [saving, setSaving] = useState(false)
  const [escalatingTarget, setEscalatingTarget] = useState<'issue' | 'risk' | null>(null)
  const [ledgerQuickFilter, setLedgerQuickFilter] = useState<'all' | 'blocked' | 'overdue' | 'supplement'>('all')
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<string>('all')
  const [expectedDateDialogOpen, setExpectedDateDialogOpen] = useState(false)

  useEffect(() => {
    if (currentProject?.id) setSelectedProjectId(currentProject.id)
  }, [currentProject])

  useEffect(() => {
    if (!selectedProjectId) {
      setBoard(null)
      setLedger(null)
      setDetail(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    const load = async () => {
      try {
        const [boardResponse, ledgerResponse] = await Promise.all([
          fetch(buildBoardUrl(selectedProjectId), withFreshDataOptions()),
          fetch(buildLedgerUrl(selectedProjectId), withFreshDataOptions()),
        ])
        const [boardResult, ledgerResult] = [
          (await boardResponse.json()) as ApiResponse<CertificateBoardResponse>,
          (await ledgerResponse.json()) as ApiResponse<CertificateLedgerResponse>,
        ]

        if (!cancelled) {
          if (boardResult.success && boardResult.data) {
            setBoard(boardResult.data)
            const nextCertificateId =
              boardResult.data.certificates.find((item) => item.is_blocked)?.id ||
              boardResult.data.certificates[0]?.id ||
              null
            setSelectedCertificateId(selectedCertificateIdRef.current || nextCertificateId)
          }

          if (ledgerResult.success && ledgerResult.data) {
            setLedger(ledgerResult.data)
          }
        }
      } catch (error) {
        console.error('Failed to load pre-milestone board', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [selectedProjectId, setSelectedCertificateId])

  useEffect(() => {
    if (!selectedProjectId || !selectedCertificateId) return

    let cancelled = false
    setDetailLoading(true)

    const loadDetail = async () => {
      try {
        const response = await fetch(
          buildDetailUrl(selectedProjectId, selectedCertificateId),
          withFreshDataOptions(),
        )
        const result = (await response.json()) as ApiResponse<CertificateDetailResponse>
        if (!cancelled && result.success && result.data) {
          setDetail(result.data)
        }
      } catch (error) {
        console.error('Failed to load certificate detail', error)
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    }

    void loadDetail()
    return () => {
      cancelled = true
    }
  }, [selectedCertificateId, selectedProjectId])

  const currentProjectName = projectOptions.find((project) => project.id === selectedProjectId)?.name || currentProject?.name
  const certificates = useMemo(() => board?.certificates ?? [], [board?.certificates])
  const sharedItems = useMemo(() => board?.sharedItems ?? [], [board?.sharedItems])
  const workItems = useMemo(() => ledger?.items ?? [], [ledger?.items])
  const summary = board?.summary

  const selectedCertificate = useMemo(
    () => certificates.find((item) => item.id === selectedCertificateId) || null,
    [certificates, selectedCertificateId]
  )

  const overdueItems = useMemo(
    () => workItems.filter((item) => !['completed', 'cancelled'].includes(String(item.status)) && isBeforeToday(item.planned_finish_date)),
    [workItems]
  )
  const criticalItems = summary?.criticalItems ?? []

  const openDetailForCertificate = (certificateId: string) => {
    setSelectedCertificateId(certificateId)
    setDetailOpen(true)
  }

  const openDetailForWorkItem = (workItemId: string) => {
    setSelectedWorkItemId(workItemId)
    const workItem = workItems.find((item) => item.id === workItemId)
    const fallbackCertificateId = workItem?.certificate_ids?.[0] || selectedCertificateId || certificates[0]?.id || null
    if (fallbackCertificateId) {
      setSelectedCertificateId(fallbackCertificateId)
      setDetailOpen(true)
    }
  }

  const openCreateDialog = (prefill?: CertificateWorkItemFormData) => {
    if (!canEdit) {
      toast({ title: '当前为只读模式', description: '没有编辑权限，无法新增办理事项', variant: 'destructive' })
      return
    }
    setEditingItem(null)
    setDialogMode('create')
    setFormData(prefill || createEmptyWorkItemForm())
    setDialogOpen(true)
  }

  const openEditDialog = (item: CertificateWorkItem) => {
    if (!canEdit) {
      toast({ title: '当前为只读模式', description: '没有编辑权限，无法修改办理事项', variant: 'destructive' })
      return
    }
    setEditingItem(item)
    setDialogMode('edit')
    setFormData(buildFormFromItem(item, selectedCertificateId))
    setDialogOpen(true)
  }

  const toggleCertificateInForm = (certificateId: string) => {
    setFormData((previous) => {
      const exists = previous.certificate_ids.includes(certificateId)
      return {
        ...previous,
        certificate_ids: exists
          ? previous.certificate_ids.filter((id) => id !== certificateId)
          : [...previous.certificate_ids, certificateId],
      }
    })
  }

  const refreshData = async () => {
    if (!selectedProjectId) return
    try {
      const [boardResponse, ledgerResponse] = await Promise.all([
        fetch(buildBoardUrl(selectedProjectId), withFreshDataOptions()),
        fetch(buildLedgerUrl(selectedProjectId), withFreshDataOptions()),
      ])
      const [boardResult, ledgerResult] = [
        (await boardResponse.json()) as ApiResponse<CertificateBoardResponse>,
        (await ledgerResponse.json()) as ApiResponse<CertificateLedgerResponse>,
      ]

      if (boardResult.success && boardResult.data) setBoard(boardResult.data)
      if (ledgerResult.success && ledgerResult.data) setLedger(ledgerResult.data)
    } catch (error) {
      console.error('Failed to refresh board', error)
    }
  }

  const refreshDetail = async (certificateId: string) => {
    if (!selectedProjectId || !certificateId) return

    const response = await fetch(
      buildDetailUrl(selectedProjectId, certificateId),
      withFreshDataOptions(),
    )
    const result = (await response.json()) as ApiResponse<CertificateDetailResponse>
    if (result.success && result.data) {
      setDetail(result.data)
    }
  }

  const handleEscalate = async (target: 'issue' | 'risk', workItemId?: string | null) => {
    if (!canEdit) {
      toast({ title: '当前为只读模式', description: '没有编辑权限，无法升级为问题或风险', variant: 'destructive' })
      return
    }
    if (!selectedProjectId || !selectedCertificateId) {
      toast({ title: '请先选择证照', variant: 'destructive' })
      return
    }

    const requestCertificateId = detail?.certificate.id || selectedCertificateId

    setEscalatingTarget(target)
    try {
      const response = await fetch(
        buildEscalationUrl(selectedProjectId, requestCertificateId, target),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            work_item_id: workItemId || null,
          }),
        }
      )

      const result = (await response.json()) as ApiResponse<{ title?: string }>
      if (result.success) {
        toast({ title: target === 'issue' ? '已升级到问题主链' : '已升级到风险主链' })
        await refreshData()
        await refreshDetail(requestCertificateId)
      } else {
        toast({
          title: target === 'issue' ? '升级问题失败' : '升级风险失败',
          description: result.error?.message || '请稍后重试',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error(`Failed to escalate certificate ${target}`, error)
      toast({
        title: target === 'issue' ? '升级问题失败' : '升级风险失败',
        description: '请检查网络连接',
        variant: 'destructive',
      })
    } finally {
      setEscalatingTarget(null)
    }
  }

  const handleSaveWorkItem = async () => {
    if (!canEdit) {
      toast({ title: '当前为只读模式', description: '没有编辑权限，无法保存办理事项', variant: 'destructive' })
      return
    }
    if (!selectedProjectId) {
      toast({ title: '请先选择项目', variant: 'destructive' })
      return
    }
    if (!formData.item_name.trim()) {
      toast({ title: '请输入办理事项名称', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const isEdit = dialogMode === 'edit' && editingItem
      const availableCertificateIds = new Set(certificates.map((item) => item.id))
      const resolvedCertificateIds = [...new Set(formData.certificate_ids.filter((id) => availableCertificateIds.has(id)))]
      const url = isEdit
        ? `${API_BASE}/api/projects/${selectedProjectId}/certificate-work-items/${editingItem.id}`
        : `${API_BASE}/api/projects/${selectedProjectId}/certificate-work-items`
      const method = isEdit ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_code: formData.item_code || undefined,
          item_name: formData.item_name,
          item_stage: formData.item_stage,
          status: formData.status,
          planned_finish_date: formData.planned_finish_date || null,
          actual_finish_date: formData.actual_finish_date || null,
          approving_authority: formData.approving_authority || null,
          is_shared: resolvedCertificateIds.length > 1 ? true : formData.is_shared,
          next_action: formData.next_action || null,
          next_action_due_date: formData.next_action_due_date || null,
          is_blocked: formData.is_blocked,
          block_reason: formData.block_reason || null,
          sort_order: formData.sort_order,
          notes: formData.notes || null,
          certificate_ids: resolvedCertificateIds,
        }),
      })

      const result = (await response.json()) as ApiResponse<CertificateWorkItem>
      if (result.success) {
        toast({ title: isEdit ? '已更新办理事项' : '已新增办理事项' })
        setDialogOpen(false)
        setEditingItem(null)
        setSelectedWorkItemId(result.data?.id || null)
        await refreshData()
        if (selectedCertificateId) {
          await refreshDetail(selectedCertificateId)
        }
      } else {
        toast({ title: '保存失败', description: result.error?.message || '请稍后重试', variant: 'destructive' })
      }
    } catch (error) {
      console.error('Failed to save work item', error)
      toast({ title: '保存失败', description: '请检查网络连接', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const refreshSelectedDetail = async (certificateId: string | null = selectedCertificateId) => {
    if (selectedProjectId && certificateId) {
      await refreshDetail(certificateId)
    }
  }

  const handleSubmitCondition = async (payload: {
    conditionId: string | null
    preMilestoneId: string
    form: {
      condition_type: string
      condition_name: string
      description: string
      target_date: string
    }
  }) => {
    if (!selectedProjectId || !payload.preMilestoneId) return

    const isEditing = Boolean(payload.conditionId)
    const url = isEditing
      ? `${API_BASE}/api/pre-milestone-conditions/${encodeURIComponent(payload.conditionId || '')}`
      : `${API_BASE}/api/pre-milestone-conditions`
    const method = isEditing ? 'PUT' : 'POST'

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pre_milestone_id: payload.preMilestoneId,
          condition_type: payload.form.condition_type,
          condition_name: payload.form.condition_name,
          description: payload.form.description || null,
          target_date: payload.form.target_date || null,
        }),
      })

      const result = (await response.json()) as ApiResponse<unknown>
      if (result.success) {
        toast({ title: isEditing ? '已更新条件' : '已新增条件' })
        await refreshData()
        await refreshSelectedDetail(payload.preMilestoneId)
        return
      }

      toast({
        title: isEditing ? '更新条件失败' : '新增条件失败',
        description: result.error?.message || '请稍后重试',
        variant: 'destructive',
      })
    } catch (error) {
      console.error('Failed to submit condition', error)
      toast({
        title: isEditing ? '更新条件失败' : '新增条件失败',
        description: '请检查网络连接',
        variant: 'destructive',
      })
    }
  }

  const handleUpdateConditionStatus = async (conditionId: string, status: string) => {
    if (!conditionId) return

    try {
      const response = await fetch(`${API_BASE}/api/pre-milestone-conditions/${encodeURIComponent(conditionId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const result = (await response.json()) as ApiResponse<unknown>
      if (result.success) {
        toast({ title: '已更新条件状态' })
        await refreshData()
        await refreshSelectedDetail()
        return
      }

      toast({
        title: '更新条件状态失败',
        description: result.error?.message || '请稍后重试',
        variant: 'destructive',
      })
    } catch (error) {
      console.error('Failed to update condition status', error)
      toast({
        title: '更新条件状态失败',
        description: '请检查网络连接',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteCondition = async (conditionId: string) => {
    if (!conditionId) return

    try {
      const response = await fetch(`${API_BASE}/api/pre-milestone-conditions/${encodeURIComponent(conditionId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
      const result = (await response.json()) as ApiResponse<unknown>
      if (result.success) {
        toast({ title: '已删除条件' })
        await refreshData()
        await refreshSelectedDetail()
        return
      }

      toast({
        title: '删除条件失败',
        description: result.error?.message || '请稍后重试',
        variant: 'destructive',
      })
    } catch (error) {
      console.error('Failed to delete condition', error)
      toast({
        title: '删除条件失败',
        description: '请检查网络连接',
        variant: 'destructive',
      })
    }
  }

  const handleCreateCertificateDependency = async (payload: {
    predecessor_type: 'certificate' | 'work_item'
    predecessor_id: string
    successor_type: 'certificate' | 'work_item'
    successor_id: string
    dependency_kind: 'hard' | 'soft'
    notes?: string | null
  }) => {
    if (!selectedProjectId) return

    try {
      const response = await fetch(`${API_BASE}/api/projects/${selectedProjectId}/certificate-dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = (await response.json()) as ApiResponse<unknown>
      if (result.success) {
        toast({ title: '已新增证照依赖' })
        await refreshData()
        await refreshSelectedDetail()
        return
      }

      toast({
        title: '新增证照依赖失败',
        description: result.error?.message || '请稍后重试',
        variant: 'destructive',
      })
    } catch (error) {
      console.error('Failed to create certificate dependency', error)
      toast({
        title: '新增证照依赖失败',
        description: '请检查网络连接',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteCertificateDependency = async (dependencyId: string) => {
    if (!selectedProjectId) return

    try {
      const response = await fetch(`${API_BASE}/api/projects/${selectedProjectId}/certificate-dependencies/${encodeURIComponent(dependencyId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
      const result = (await response.json()) as ApiResponse<unknown>
      if (result.success) {
        toast({ title: '已删除证照依赖' })
        await refreshData()
        await refreshSelectedDetail()
        return
      }

      toast({
        title: '删除证照依赖失败',
        description: result.error?.message || '请稍后重试',
        variant: 'destructive',
      })
    } catch (error) {
      console.error('Failed to delete certificate dependency', error)
      toast({
        title: '删除证照依赖失败',
        description: '请检查网络连接',
        variant: 'destructive',
      })
    }
  }

  return (
    <div data-testid="pre-milestones-page" className="min-h-screen bg-slate-50 p-6 page-enter">
      <Breadcrumb
        items={[
          { label: '公司驾驶舱', href: '/company' },
          ...(currentProjectName ? [{ label: currentProjectName, href: `/projects/${selectedProjectId}` }] : []),
          { label: '专项管理' },
          { label: '前期证照' },
        ]}
        className="mb-4"
      />

      <PageHeader
        eyebrow="专项管理"
        title="前期证照"
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {projectOptions.length > 1 && (
            <Select value={selectedProjectId || undefined} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="w-[220px] rounded-2xl border-slate-200 bg-white text-sm">
                <SelectValue placeholder="请选择项目" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-slate-200 bg-white">
                {projectOptions.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            type="button"
            onClick={refreshData}
            variant="outline"
          >
            <RefreshCw className="h-4 w-4" />
            刷新数据
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => navigate(`/projects/${selectedProjectId}/drawings`)}
            variant="outline"
            disabled={!selectedProjectId}
            data-testid="pre-milestones-go-drawings"
          >
            <FolderOpen className="h-4 w-4" />
            查看施工图纸
          </Button>
          <Button
            type="button"
            onClick={() => {
              const overdue = overdueItems[0]
              if (overdue) {
                openDetailForWorkItem(overdue.id)
              } else if (selectedCertificateId) {
                openDetailForCertificate(selectedCertificateId)
              }
            }}
            variant="outline"
            className="border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100 hover:text-amber-800"
          >
            <AlertTriangle className="h-4 w-4" />
            查看全部逾期
          </Button>
          <Button
            type="button"
            onClick={() => openCreateDialog(buildFormFromItem(null, selectedCertificateId))}
            className="bg-slate-900 text-white hover:bg-slate-800"
            disabled={!canEdit}
          >
            <Plus className="h-4 w-4" />
            新增办理事项
          </Button>
        </div>
      </div>

      {loading && !board ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((index) => (
            <div key={index} className="rounded-card border border-slate-200 bg-white p-4">
              <Skeleton className="h-4 w-24 rounded-full" />
              <Skeleton className="mt-4 h-8 w-16 rounded-full" />
              <Skeleton className="mt-4 h-3 w-2/3 rounded-full" />
              <Skeleton className="mt-3 h-3 w-1/2 rounded-full" />
            </div>
          ))}
        </div>
      ) : !selectedProjectId ? (
        <EmptyState
          icon={ArrowRight}
          title="请选择项目"
          action={null}
        />
      ) : (
        <div className="grid gap-5">
          <LifecycleSummaryCards summary={summary || {
            completedCount: 0,
            totalCount: 0,
            blockingCertificateType: null,
            expectedReadyDate: null,
            overdueCount: 0,
            supplementCount: 0,
            weeklyActionCount: 0,
          }}
          onClickBlockingCertificate={() => {
            const blocking = certificates.find((c) => c.certificate_type === summary?.blockingCertificateType)
            if (blocking) {
              setSelectedCertificateId(blocking.id)
              openDetailForCertificate(blocking.id)
            }
          }}
          onClickExpectedReadyDate={() => {
            if (summary?.expectedReadyDate) {
              setExpectedDateDialogOpen(true)
            }
          }}
          onClickOverdue={() => setLedgerQuickFilter('overdue')}
          />

          <div data-testid="pre-milestones-overview" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">开工准入总览</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedCertificate
                    ? `当前卡点：${selectedCertificate.certificate_name} · ${mapCertificateStatusLabel(selectedCertificate.status)}`
                    : '当前卡点：待选择'}
                </p>
              </div>
            </div>

            <CertificateSharedRibbon
              items={sharedItems}
              selectedWorkItemId={selectedWorkItemId}
              hoveredWorkItemId={hoveredWorkItemId}
              hoveredCertificateId={hoveredCertificateType}
              onSelectWorkItem={openDetailForWorkItem}
              onHoverWorkItem={setHoveredWorkItemId}
            />
          </div>

          <FourCertificateBoard
            certificates={certificates}
            sharedItems={sharedItems}
            selectedCertificateId={selectedCertificateId}
            selectedWorkItemId={selectedWorkItemId}
            hoveredWorkItemId={hoveredWorkItemId}
            onSelectCertificate={(certificateId) => setSelectedCertificateId(certificateId)}
            onSelectWorkItem={(workItemId) => {
              setSelectedWorkItemId(workItemId)
              openDetailForWorkItem(workItemId)
            }}
            onOpenCertificateDetail={openDetailForCertificate}
            onHoverCertificate={(certId) => {
              if (!certId) { setHoveredCertificateType(null); return }
              const cert = certificates.find((c) => c.id === certId)
              setHoveredCertificateType(cert?.certificate_type ?? null)
            }}
            onClickBlockedTag={() => {
              setLedgerQuickFilter('blocked')
              setTimeout(() => {
                const ledger = document.querySelector('[data-testid="pre-milestones-ledger"]')
                ledger?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }, 50)
            }}
          />

          <CertificateLedger
            items={workItems}
            certificates={certificates}
            sharedItems={sharedItems}
            canEdit={canEdit}
            selectedWorkItemId={selectedWorkItemId}
            filterByWorkItemId={selectedWorkItemId}
            quickFilter={ledgerQuickFilter}
            onQuickFilterChange={setLedgerQuickFilter}
            typeFilter={ledgerTypeFilter}
            onTypeFilterChange={setLedgerTypeFilter}
            onSelectWorkItem={(workItemId) => {
              setSelectedWorkItemId(workItemId)
              openDetailForWorkItem(workItemId)
            }}
            onOpenDetail={(certificateId, workItemId) => {
              if (workItemId) setSelectedWorkItemId(workItemId)
              openDetailForCertificate(certificateId)
            }}
            onAddItem={(prefill) => openCreateDialog(prefill)}
            onEditItem={openEditDialog}
            onEscalateIssue={(workItemId) => void handleEscalate('issue', workItemId)}
            onEscalateRisk={(workItemId) => void handleEscalate('risk', workItemId)}
          />
        </div>
      )}

      {canEdit ? (
        <CertificateWorkItemDialog
          open={dialogOpen}
          mode={dialogMode}
          formData={formData}
          setFormData={setFormData}
          certificates={certificates}
          onClose={() => setDialogOpen(false)}
          onSave={() => void handleSaveWorkItem()}
          onToggleCertificate={toggleCertificateInForm}
          editingItem={editingItem}
        />
      ) : null}

      <CertificateDetailDrawer
        open={detailOpen}
        detail={detailLoading ? null : detail}
        onClose={() => setDetailOpen(false)}
        onSelectCertificate={(certificateId) => setSelectedCertificateId(certificateId)}
        onSelectWorkItem={(workItemId) => {
          setSelectedWorkItemId(workItemId)
          const workItem = ledger?.items.find((item) => item.id === workItemId)
          const nextCertificateId = workItem?.certificate_ids?.[0] || selectedCertificateId
          if (nextCertificateId) setSelectedCertificateId(nextCertificateId)
        }}
        onEscalateIssue={(workItemId) => void handleEscalate('issue', workItemId)}
        onEscalateRisk={(workItemId) => void handleEscalate('risk', workItemId)}
        onSubmitCondition={handleSubmitCondition}
        onUpdateConditionStatus={handleUpdateConditionStatus}
        onDeleteCondition={handleDeleteCondition}
        onCreateCertificateDependency={handleCreateCertificateDependency}
        onDeleteCertificateDependency={handleDeleteCertificateDependency}
        escalatingIssue={escalatingTarget === 'issue'}
        escalatingRisk={escalatingTarget === 'risk'}
        selectedCertificateId={selectedCertificateId}
        selectedWorkItemId={selectedWorkItemId}
        projectId={selectedProjectId}
        certificates={certificates}
        canEdit={canEdit}
      />

      <Dialog open={expectedDateDialogOpen} onOpenChange={setExpectedDateDialogOpen}>
        <DialogContent className="max-w-md" data-testid="expected-date-dialog">
          <DialogHeader>
            <DialogTitle>预计具备开工条件日期</DialogTitle>
            <DialogDescription className="sr-only">显示证件依赖关系和预计开工时间推算依据。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
              <div className="text-xs text-slate-500">预计日期</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">{summary?.expectedReadyDate || '—'}</div>
            </div>
            <div className="text-sm text-slate-600">
              <p className="font-medium text-slate-900 mb-2">推算依据</p>
              <ul className="space-y-1 text-xs text-slate-500">
                <li>· 基于当前阻塞证件的预计完成时间取最晚值</li>
                <li>· 所有四证（用地证、规划许可、工程许可、施工许可）须均完成</li>
                {summary?.blockingCertificateType ? (
                  <li className="text-amber-600">· 当前卡点证件：{summary.blockingCertificateType}</li>
                ) : null}
                {summary?.completedCount !== undefined ? (
                  <li className="text-emerald-600">· 已完成 {summary.completedCount} / {summary.totalCount ?? 4} 个证件</li>
                ) : null}
              </ul>
            </div>
            {criticalItems.length > 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 text-xs font-medium text-slate-900">关键项</div>
                <div className="space-y-2">
                  {criticalItems.slice(0, 6).map((item) => (
                    <div key={`${item.itemType}:${item.itemId}`} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-900">{item.title}</span>
                        <span className={`rounded-full px-2 py-0.5 font-medium ${item.itemType === 'certificate' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                          {mapCertificateStatusLabel(item.status)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                        {item.dueDate ? <span>截止：{item.dueDate}</span> : null}
                        {item.isOverdue ? <span className="text-red-600">已逾期</span> : null}
                      </div>
                      {item.blockReason ? <div className="mt-1 text-[11px] text-amber-700">{item.blockReason}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
