import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CheckCircle2, FileCheck2, FileBadge2, Plus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LoadingState } from '@/components/ui/loading-state'
import { useDialogFocusRestore } from '@/hooks/useDialogFocusRestore'
import { useToast } from '@/hooks/use-toast'
import { apiPost } from '@/lib/apiClient'
import { cn } from '@/lib/utils'
import type {
  AcceptanceLinkedIssue,
  AcceptanceLinkedRisk,
  AcceptanceLinkedTask,
  AcceptanceLinkedWarning,
  AcceptanceNode,
  AcceptancePlan,
  AcceptancePlanRelationBundle,
  AcceptanceStatus,
  AcceptanceType,
} from '@/types/acceptance'
import { getAcceptanceDisplayBadges, getAcceptancePredecessorIds, getAcceptanceSuccessorIds } from '@/types/acceptance'

import { formatLinkedStatus, getAcceptanceStatusMeta, getIcon, getTypeById } from '../utils'

interface AcceptanceDetailDrawerProps {
  node: AcceptanceNode | null
  allPlans: AcceptancePlan[]
  open: boolean
  customTypes: AcceptanceType[]
  detailContext: AcceptancePlanRelationBundle | null
  detailLoading: boolean
  projectId: string
  onClose: () => void
  onStatusChange: (nodeId: string, status: AcceptanceStatus) => void
  onDependencyAdd: (nodeId: string, dependsOnId: string) => void
  onDependencyRemove: (nodeId: string, dependsOnId: string) => void
  onRequirementCreate: (
    nodeId: string,
    input: {
      requirement_type: string
      source_entity_type: string
      source_entity_id: string
      description?: string | null
      status?: string | null
    },
  ) => Promise<void> | void
  onRecordCreate: (
    nodeId: string,
    input: {
      record_type: string
      content: string
      operator?: string | null
      record_date?: string | null
    },
  ) => Promise<void> | void
  onDateUpdate?: (planId: string, plannedDate: string) => void
  onPlanUpdate?: (planId: string, updates: Partial<AcceptancePlan>) => Promise<void> | void
  canEdit?: boolean
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['preparing'],
  preparing: ['ready_to_submit'],
  ready_to_submit: ['submitted'],
  submitted: ['inspecting'],
  inspecting: ['passed', 'rectifying'],
  rectifying: ['ready_to_submit', 'inspecting'],
  passed: ['archived'],
  archived: [],
}

function canTransition(from: string, to: string): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to)
}

function createEmptyRequirementDraft() {
  return {
    requirement_type: 'external',
    source_entity_type: 'task_condition',
    source_entity_id: '',
    description: '',
    status: 'open',
  }
}

function createEmptyRecordDraft() {
  return {
    record_type: 'note',
    content: '',
    operator: '',
    record_date: '',
  }
}

function formatRequirementBlockLabel(requirement: {
  description?: string | null
  source_entity_id: string
  requirement_type: string
}) {
  return requirement.description?.trim()
    || requirement.source_entity_id.trim()
    || requirement.requirement_type.trim()
    || '未命名条件'
}

function getActionErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback
}

export default function AcceptanceDetailDrawer({
  node,
  allPlans,
  open,
  customTypes,
  detailContext,
  detailLoading,
  projectId,
  onClose,
  onStatusChange,
  onDependencyAdd,
  onDependencyRemove,
  onRequirementCreate,
  onRecordCreate,
  onDateUpdate,
  onPlanUpdate,
  canEdit = true,
}: AcceptanceDetailDrawerProps) {
  useDialogFocusRestore(open)
  const { toast } = useToast()
  const canMutate = canEdit !== false

  const [dependencyTargetId, setDependencyTargetId] = useState('')
  const [requirementDraft, setRequirementDraft] = useState(createEmptyRequirementDraft)
  const [recordDraft, setRecordDraft] = useState(createEmptyRecordDraft)
  const [creatingRequirement, setCreatingRequirement] = useState(false)
  const [creatingRecord, setCreatingRecord] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)
  const [mutatingDependency, setMutatingDependency] = useState(false)
  const [mutatingParallelGroup, setMutatingParallelGroup] = useState(false)
  const [parallelGroupTargetId, setParallelGroupTargetId] = useState('')
  const [parallelGroupDraft, setParallelGroupDraft] = useState('')
  const [escalatingIssue, setEscalatingIssue] = useState(false)

  const currentNodeId = node?.id || ''
  const planRow = useMemo(
    () => allPlans.find((item) => item.id === currentNodeId) || null,
    [allPlans, currentNodeId],
  )
  const planLookup = useMemo(() => new Map(allPlans.map((item) => [item.id, item])), [allPlans])
  const dependencyOptions = useMemo(
    () => allPlans.filter((item) => item.id !== currentNodeId),
    [allPlans, currentNodeId],
  )
  const parallelGroupOptions = useMemo(() => {
    const groups = new Map<string, AcceptancePlan[]>()
    allPlans.forEach((plan) => {
      const groupId = String(plan.parallel_group_id ?? '').trim()
      if (!groupId) return
      groups.set(groupId, [...(groups.get(groupId) ?? []), plan])
    })
    return Array.from(groups.entries())
      .map(([groupId, members]) => ({ groupId, members }))
      .sort((left, right) => left.groupId.localeCompare(right.groupId, 'zh-CN'))
  }, [allPlans])

  useEffect(() => {
    setDependencyTargetId((current) =>
      current && dependencyOptions.some((item) => item.id === current)
        ? current
        : dependencyOptions[0]?.id || '',
    )
  }, [dependencyOptions])

  useEffect(() => {
    setRequirementDraft(createEmptyRequirementDraft())
    setRecordDraft(createEmptyRecordDraft())
    setParallelGroupDraft('')
  }, [node?.id, open])

  useEffect(() => {
    const currentGroupId = String(planRow?.parallel_group_id ?? '').trim()
    const existingTargetIsValid = parallelGroupOptions.some((group) => (
      group.groupId === parallelGroupTargetId && group.groupId !== currentGroupId
    ))
    if (existingTargetIsValid) return
    setParallelGroupTargetId(parallelGroupOptions.find((group) => group.groupId !== currentGroupId)?.groupId || '')
  }, [parallelGroupOptions, parallelGroupTargetId, planRow?.parallel_group_id])

  if (!node) return null

  const statusMeta = getAcceptanceStatusMeta(node.status)
  const type = getTypeById(node.typeId, customTypes)
  const StatusIcon = getIcon(statusMeta.config.icon)

  async function handleStatusChange(targetStatus: string) {
    if (!node) return
    if (!canTransition(node.status, targetStatus)) {
      toast({
        title: '状态推进不合法',
        description: `当前状态「${node.status}」不允许直接跳转到「${targetStatus}」，请按流程逐步推进。`,
        variant: 'destructive',
      })
      return
    }
    setChangingStatus(true)
    try {
      await onStatusChange(node.id, targetStatus as AcceptanceStatus)
    } catch (error) {
      toast({
        title: '状态更新失败',
        description: getActionErrorMessage(error, '验收状态未能更新，请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setChangingStatus(false)
    }
  }

  const prerequisites = detailContext?.requirements || []
  const dependencies = detailContext?.dependencies || []
  const records = detailContext?.records || []
  const linkedWarnings = filterLinkedWarnings(node, allPlans, detailContext)
  const linkedIssues = filterLinkedIssues(node, allPlans, detailContext)
  const linkedRisks = filterLinkedRisks(node, allPlans, detailContext, linkedIssues)
  const overlayBadges = planRow ? getAcceptanceDisplayBadges(planRow) : []
  const predecessorPlanIds = planRow ? getAcceptancePredecessorIds(planRow) : []
  const successorPlanIds = planRow ? getAcceptanceSuccessorIds(planRow) : []
  const upstreamDependencies = dependencies.filter((item) => item.target_plan_id === currentNodeId)
  const downstreamDependencies = dependencies.filter((item) => item.source_plan_id === currentNodeId)
  const currentParallelGroupId = String(planRow?.parallel_group_id ?? '').trim()
  const currentParallelGroupMembers = currentParallelGroupId
    ? parallelGroupOptions.find((group) => group.groupId === currentParallelGroupId)?.members.filter((item) => item.id !== currentNodeId) ?? []
    : []

  async function persistPlanUpdates(updates: Partial<AcceptancePlan>) {
    if (!node) return
    if (Object.keys(updates).length === 0) return

    if (onPlanUpdate) {
      await onPlanUpdate(node.id, updates)
      return
    }

    if ('planned_date' in updates && onDateUpdate) {
      await onDateUpdate(node.id, String(updates.planned_date ?? ''))
    }
  }

  const canCreateRequirement = Boolean(
    requirementDraft.requirement_type.trim()
    && requirementDraft.source_entity_type.trim()
    && requirementDraft.source_entity_id.trim(),
  )
  const canCreateRecord = Boolean(recordDraft.record_type.trim() && recordDraft.content.trim())

  const predecessorPlans = predecessorPlanIds.map((pid) => allPlans.find((p) => p.id === pid)).filter(Boolean) as typeof allPlans
  const unmetPredecessors = predecessorPlans.filter((p) => p.status !== 'passed' && p.status !== 'archived')
  const prerequisitesMet = unmetPredecessors.length === 0
  const prerequisiteBlockReason = prerequisitesMet
    ? null
    : `前置项未完成：${unmetPredecessors.map((p) => p.name).join('、')}`
  const unmetRequiredRequirements = prerequisites.filter((item) => item.is_required && !item.is_satisfied)
  const requiredRequirementsMet = unmetRequiredRequirements.length === 0
  const requirementBlockReason = requiredRequirementsMet
    ? null
    : `必填验收条件未满足：${unmetRequiredRequirements.map(formatRequirementBlockLabel).join('、')}`
  const submitBlockedReason = detailLoading
    ? '正在加载申报校验条件，请稍候。'
    : detailContext == null
      ? '申报校验数据加载失败，请刷新后重试。'
      : [prerequisiteBlockReason, requirementBlockReason].filter(Boolean).join('；') || null
  const canSubmitDeclaration = !changingStatus && !detailLoading && detailContext != null && prerequisitesMet && requiredRequirementsMet

  async function handleDependencyAdd() {
    if (!dependencyTargetId || !currentNodeId) return
    setMutatingDependency(true)
    try {
      await onDependencyAdd(currentNodeId, dependencyTargetId)
    } catch (error) {
      toast({
        title: '新增前置失败',
        description: getActionErrorMessage(error, '前置依赖未能保存，请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setMutatingDependency(false)
    }
  }

  async function handleDependencyRemove(sourcePlanId: string) {
    if (!currentNodeId) return
    setMutatingDependency(true)
    try {
      await onDependencyRemove(currentNodeId, sourcePlanId)
    } catch (error) {
      toast({
        title: '移除前置失败',
        description: getActionErrorMessage(error, '前置依赖未能移除，请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setMutatingDependency(false)
    }
  }

  async function handleJoinParallelGroup(groupId: string) {
    const normalizedGroupId = groupId.trim()
    if (!normalizedGroupId || normalizedGroupId === currentParallelGroupId) return
    setMutatingParallelGroup(true)
    try {
      await persistPlanUpdates({ parallel_group_id: normalizedGroupId })
      setParallelGroupDraft('')
      toast({ title: '并行组已更新', description: `已加入 ${normalizedGroupId}` })
    } catch (error) {
      toast({
        title: '并行组更新失败',
        description: getActionErrorMessage(error, '并行组未能保存，请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setMutatingParallelGroup(false)
    }
  }

  async function handleExitParallelGroup() {
    if (!currentParallelGroupId) return
    setMutatingParallelGroup(true)
    try {
      await persistPlanUpdates({ parallel_group_id: null })
      toast({ title: '已退出并行组', description: currentParallelGroupId })
    } catch (error) {
      toast({
        title: '退出并行组失败',
        description: getActionErrorMessage(error, '并行组未能更新，请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setMutatingParallelGroup(false)
    }
  }

  async function handleRequirementCreate() {
    if (!canCreateRequirement) return
    setCreatingRequirement(true)
    try {
      await onRequirementCreate(currentNodeId, {
        requirement_type: requirementDraft.requirement_type.trim(),
        source_entity_type: requirementDraft.source_entity_type.trim(),
        source_entity_id: requirementDraft.source_entity_id.trim(),
        description: requirementDraft.description.trim() || null,
        status: requirementDraft.status.trim() || null,
      })
      setRequirementDraft(createEmptyRequirementDraft())
    } catch (error) {
      toast({
        title: '新增条件失败',
        description: getActionErrorMessage(error, '验收条件未能保存，请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setCreatingRequirement(false)
    }
  }

  async function handleRecordCreate() {
    if (!canCreateRecord) return
    setCreatingRecord(true)
    try {
      await onRecordCreate(currentNodeId, {
        record_type: recordDraft.record_type.trim(),
        content: recordDraft.content.trim(),
        operator: recordDraft.operator.trim() || null,
        record_date: recordDraft.record_date.trim() || null,
      })
      setRecordDraft(createEmptyRecordDraft())
    } catch (error) {
      toast({
        title: '新增记录失败',
        description: getActionErrorMessage(error, '过程记录未能保存，请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setCreatingRecord(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto" data-testid="acceptance-detail-drawer">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <DialogTitle className="text-xl">{node.name}</DialogTitle>
              <p className="text-sm text-slate-500">{type?.name || node.typeId}</p>
              <div className="flex flex-wrap gap-1.5">
                {overlayBadges.length > 0 ? overlayBadges.map((badge) => (
                  <Badge key={badge} variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                    {badge}
                  </Badge>
                )) : (
                  <Badge variant="outline" className="border-slate-200 text-slate-500">
                    无叠加标签
                  </Badge>
                )}
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn(
                'gap-1.5',
                statusMeta.config.bg,
                statusMeta.config.textColor,
                statusMeta.config.borderColor,
              )}
              data-testid="acceptance-detail-status"
            >
              <StatusIcon className="h-3.5 w-3.5" />
              {statusMeta.label}
            </Badge>
          </div>
          <DialogDescription className="sr-only">
            查看验收节点详情、前置与依赖、资料与条件、过程记录和联动信息。
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-1">
            <div className="text-xs text-slate-500">计划日期</div>
            <input
              type="date"
              defaultValue={node.planned_date || ''}
              onBlur={(e) => {
                const nextValue = e.target.value || ''
                if (nextValue !== (node.planned_date || '')) {
                  void persistPlanUpdates({ planned_date: nextValue || null })
                }
              }}
              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-900 focus:border-blue-400 focus:outline-none"
              data-testid="acceptance-planned-date-input"
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-500">实际日期</div>
            <input
              type="date"
              defaultValue={node.actual_date || ''}
              onBlur={(e) => {
                const nextValue = e.target.value || ''
                if (nextValue !== (node.actual_date || '')) {
                  void persistPlanUpdates({ actual_date: nextValue || null })
                }
              }}
              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-900 focus:border-blue-400 focus:outline-none"
              data-testid="acceptance-actual-date-input"
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-500">并行组</div>
            <input
              type="text"
              defaultValue={planRow?.parallel_group_id || ''}
              onBlur={(e) => {
                const nextValue = e.target.value.trim()
                if (nextValue !== (planRow?.parallel_group_id || '')) {
                  void persistPlanUpdates({ parallel_group_id: nextValue || null })
                }
              }}
              placeholder="填写并行组编号"
              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-900 focus:border-blue-400 focus:outline-none"
              data-testid="acceptance-parallel-group-input"
            />
          </div>
          <InfoTile label="前置未完成" value={String(planRow?.upstream_unfinished_count ?? predecessorPlanIds.length)} />
          <InfoTile label="资料准备度" value={`${planRow?.requirement_ready_percent ?? 100}%`} />
        </div>
        <div className="mt-2 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoTile
            label="验收范围"
            value={({ project: '项目级', building: '楼栋级', unit: '单位工程级', specialty: '专项级' } as Record<string, string>)[planRow?.scope_level ?? 'project'] ?? '项目级'}
          />
          {planRow?.building_id && (
            <InfoTile label="楼栋" value={planRow.building_id} />
          )}
          {planRow?.milestone_id && (
            <InfoTile label="关联里程碑" value={planRow.milestone_id} />
          )}
          {planRow?.predecessor_plan_ids && planRow.predecessor_plan_ids.length > 0 && (
            <InfoTile label="前置验收项数" value={String(planRow.predecessor_plan_ids.length)} />
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/40 p-4" data-testid="acceptance-task-linkage">
          <h4 className="mb-2 text-sm font-semibold text-slate-900">任务联动</h4>
          <div className="grid gap-3 md:grid-cols-3">
            <CompactMetric label="楼栋归属" value={planRow?.building_id || '项目级'} />
            <CompactMetric label="里程碑挂靠" value={planRow?.milestone_id ? '已挂靠' : '未挂靠'} />
            <CompactMetric label="前置验收项" value={String(planRow?.predecessor_plan_ids?.length ?? 0)} />
          </div>
          {(detailContext?.linkedTasks ?? []).length > 0 && (
            <div className="mt-3 grid gap-2">
              {(detailContext!.linkedTasks!).map((task: AcceptanceLinkedTask) => (
                <div key={task.task_id} className="flex items-center justify-between rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{task.task_name}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      状态：{task.status}{task.planned_date ? `　计划：${task.planned_date}` : ''}
                    </div>
                  </div>
                  <Link
                    to={`/projects/${projectId}/gantt?taskId=${task.task_id}`}
                    className="ml-3 shrink-0 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"
                  >
                    前往甘特
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {node.description ? (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <div className="mb-1 text-sm font-medium text-slate-700">备注</div>
            <p className="text-sm text-slate-600">{node.description}</p>
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <LinkedBundleSection
            title="前置与依赖"
            subtitle=""
            data-testid="acceptance-external-prerequisites"
          >
            <div className="grid gap-3 md:grid-cols-3">
              <CompactMetric label="前置项" value={String(predecessorPlanIds.length)} />
              <CompactMetric label="后续受影响" value={String(planRow?.downstream_block_count ?? successorPlanIds.length)} />
              <CompactMetric label="可申报" value={planRow?.can_submit ? '是' : '否'} />
            </div>

            {planRow?.block_reason_summary ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                阻塞备注：{planRow.block_reason_summary}
              </div>
            ) : null}

            <div className="grid gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-xs text-slate-500">
                  条件类型
                  <input
                    value={requirementDraft.requirement_type}
                    onChange={(event) => setRequirementDraft((current) => ({ ...current, requirement_type: event.target.value }))}
                    disabled={!canMutate}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    placeholder="external / drawing / task_condition"
                    data-testid="acceptance-requirement-type-input"
                  />
                </label>
                <label className="grid gap-1 text-xs text-slate-500">
                  来源类型
                  <input
                    value={requirementDraft.source_entity_type}
                    onChange={(event) => setRequirementDraft((current) => ({ ...current, source_entity_type: event.target.value }))}
                    disabled={!canMutate}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    placeholder="task_condition"
                    data-testid="acceptance-requirement-source-type-input"
                  />
                </label>
                <label className="grid gap-1 text-xs text-slate-500">
                  来源 ID
                  <input
                    value={requirementDraft.source_entity_id}
                    onChange={(event) => setRequirementDraft((current) => ({ ...current, source_entity_id: event.target.value }))}
                    disabled={!canMutate}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    placeholder="condition-1"
                    data-testid="acceptance-requirement-source-id-input"
                  />
                </label>
                <label className="grid gap-1 text-xs text-slate-500">
                  状态
                  <select
                    value={requirementDraft.status}
                    onChange={(event) => setRequirementDraft((current) => ({ ...current, status: event.target.value }))}
                    disabled={!canMutate}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    <option value="open">open</option>
                    <option value="met">met</option>
                    <option value="blocked">blocked</option>
                    <option value="closed">closed</option>
                  </select>
                </label>
              </div>
              <label className="grid gap-1 text-xs text-slate-500">
                备注
                <textarea
                  value={requirementDraft.description}
                  onChange={(event) => setRequirementDraft((current) => ({ ...current, description: event.target.value }))}
                  disabled={!canMutate}
                  className="min-h-20 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  data-testid="acceptance-requirement-description-input"
                  placeholder="补充内容"
                />
              </label>
              <div className="flex justify-end">
                <Button
                  type="button"
                  className="gap-2"
                  disabled={!canMutate || !canCreateRequirement || creatingRequirement}
                  onClick={() => void handleRequirementCreate()}
                  data-testid="acceptance-create-requirement"
                >
                  <Plus className="h-4 w-4" />
                  {creatingRequirement ? '保存中...' : '新增条件'}
                </Button>
              </div>
            </div>

            <div className="grid gap-3">
              <CompactPanel label="资料与条件" count={prerequisites.length} />
              {prerequisites.length > 0 ? prerequisites.map((item) => {
                const isDrawing = item.source_entity_type === 'drawing' || item.source_entity_type === 'drawing_package'
                const isCertificate = item.source_entity_type === 'certificate' || item.source_entity_type === 'pre_milestone'
                const isSatisfied = item.is_satisfied || item.status === 'met'
                const isBlocked = item.status === 'blocked'

                if (isDrawing) {
                  return (
                    <div
                      key={item.id}
                      className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${isSatisfied ? 'border-emerald-200 bg-emerald-50' : isBlocked ? 'border-amber-200 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}
                      data-testid={`acceptance-linked-drawing-${item.id}`}
                    >
                      <FileCheck2 className={`mt-0.5 h-4 w-4 shrink-0 ${isSatisfied ? 'text-emerald-600' : isBlocked ? 'text-amber-600' : 'text-blue-600'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-800 truncate">{item.description || item.source_entity_id}</span>
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${isSatisfied ? 'bg-emerald-100 text-emerald-700' : isBlocked ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                            {isSatisfied ? '已满足' : isBlocked ? '阻塞' : '待确认'}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">关联图纸 · {item.requirement_type}</div>
                      </div>
                    </div>
                  )
                }

                if (isCertificate) {
                  return (
                    <div
                      key={item.id}
                      className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${isSatisfied ? 'border-emerald-200 bg-emerald-50' : isBlocked ? 'border-amber-200 bg-amber-50' : 'border-amber-100 bg-amber-50/70'}`}
                      data-testid={`acceptance-linked-certificate-${item.id}`}
                    >
                      <FileBadge2 className={`mt-0.5 h-4 w-4 shrink-0 ${isSatisfied ? 'text-emerald-600' : 'text-amber-600'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-800 truncate">{item.description || item.source_entity_id}</span>
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${isSatisfied ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {isSatisfied ? '已获取' : '待取得'}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">关联证照 · {item.requirement_type}</div>
                      </div>
                    </div>
                  )
                }

                return (
                  <LinkedRow
                    key={item.id}
                    title={item.requirement_type}
                    subtitle={[item.source_entity_type, item.source_entity_id].filter(Boolean).join(' / ')}
                    description={item.description || undefined}
                    meta={formatLinkedStatus(item.status)}
                  />
                )
              }) : <LinkedEmptyState text="暂无资料或条件记录。" />}

              <CompactPanel label="前置依赖" count={upstreamDependencies.length} />
              {upstreamDependencies.length > 0 ? upstreamDependencies.map((item) => (
                <LinkedRow
                  key={item.id}
                  title={planLookup.get(item.source_plan_id)?.name || item.source_plan_id}
                  subtitle=""
                  description={item.dependency_kind}
                  meta={formatLinkedStatus(item.status)}
                />
              )) : <LinkedEmptyState text="暂无前置依赖。" />}

              <CompactPanel label="下游受影响" count={downstreamDependencies.length} />
              {downstreamDependencies.length > 0 ? downstreamDependencies.map((item) => (
                <LinkedRow
                  key={item.id}
                  title={planLookup.get(item.target_plan_id)?.name || item.target_plan_id}
                  subtitle=""
                  description={item.dependency_kind}
                  meta={formatLinkedStatus(item.status)}
                />
              )) : <LinkedEmptyState text="暂无下游受影响项。" />}
            </div>
          </LinkedBundleSection>

          <LinkedBundleSection
            title="过程记录"
            subtitle=""
            data-testid="acceptance-records"
          >
            <div className="grid gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-xs text-slate-500">
                  记录类型
                <input
                  value={recordDraft.record_type}
                  onChange={(event) => setRecordDraft((current) => ({ ...current, record_type: event.target.value }))}
                  disabled={!canMutate}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  placeholder="submission / rectifying / review"
                />
                </label>
                <label className="grid gap-1 text-xs text-slate-500">
                  处理人
                <input
                  value={recordDraft.operator}
                  onChange={(event) => setRecordDraft((current) => ({ ...current, operator: event.target.value }))}
                  disabled={!canMutate}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  placeholder="operator"
                />
                </label>
                <label className="grid gap-1 text-xs text-slate-500 md:col-span-2">
                  内容
                <textarea
                  value={recordDraft.content}
                  onChange={(event) => setRecordDraft((current) => ({ ...current, content: event.target.value }))}
                  disabled={!canMutate}
                  className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  placeholder="记录申报、预约、整改、复验、通过或备案等过程事实"
                />
                </label>
                <label className="grid gap-1 text-xs text-slate-500">
                  日期
                <input
                  type="date"
                  value={recordDraft.record_date}
                  onChange={(event) => setRecordDraft((current) => ({ ...current, record_date: event.target.value }))}
                  disabled={!canMutate}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                />
                </label>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  className="gap-2"
                  disabled={!canMutate || !canCreateRecord || creatingRecord}
                  onClick={() => void handleRecordCreate()}
                >
                  <Plus className="h-4 w-4" />
                  {creatingRecord ? '保存中...' : '新增记录'}
                </Button>
              </div>
            </div>

            <div className="grid gap-3">
              <CompactPanel label="状态记录区" count={records.length} />
              {records.length > 0 ? records.map((item) => (
                <LinkedRow
                  key={item.id}
                  title={item.record_type}
                  subtitle={item.record_date || '未记录日期'}
                  description={item.content}
                  meta={item.operator || '系统'}
                />
              )) : <LinkedEmptyState text="暂无过程记录。" />}
            </div>
          </LinkedBundleSection>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <LinkedBundleSection
            title="预警信号"
            subtitle=""
            data-testid="linked-warnings"
          >
            <div className="space-y-3">
              <CompactPanel label="预警数" count={linkedWarnings.length} />
              {detailLoading ? (
                <LoadingState label="预警加载中" className="min-h-24 border-0 bg-transparent px-0 py-2 shadow-none" />
              ) : linkedWarnings.length > 0 ? (
                linkedWarnings.map((item) => (
                  <LinkedRow
                    key={item.id}
                    title={item.title}
                    subtitle={item.warning_type}
                    description={item.description}
                    meta={item.warning_level}
                  />
                ))
              ) : (
                <LinkedEmptyState text="暂无联动预警。" />
              )}
            </div>
          </LinkedBundleSection>

          <LinkedBundleSection
            title="问题标记区"
            subtitle=""
            data-testid="linked-issues"
          >
            <div className="space-y-3">
              <CompactPanel label="问题数" count={linkedIssues.length} />
              {detailLoading ? (
                <LoadingState label="问题加载中" className="min-h-24 border-0 bg-transparent px-0 py-2 shadow-none" />
              ) : linkedIssues.length > 0 ? (
                linkedIssues.map((item) => (
                  <LinkedRow
                    key={item.id}
                    title={item.title}
                    subtitle={item.severity}
                    description={item.description || undefined}
                    meta={formatLinkedStatus(item.status)}
                  />
                ))
              ) : (
                <LinkedEmptyState text="暂无联动问题。" />
              )}
            </div>
          </LinkedBundleSection>

          <LinkedBundleSection
            title="风险联动"
            subtitle=""
            data-testid="linked-risks"
          >
            <div className="space-y-3">
              <CompactPanel label="风险数" count={linkedRisks.length} />
              {detailLoading ? (
                <LoadingState label="风险加载中" className="min-h-24 border-0 bg-transparent px-0 py-2 shadow-none" />
              ) : linkedRisks.length > 0 ? (
                linkedRisks.map((item) => (
                  <LinkedRow
                    key={item.id}
                    title={item.title}
                    subtitle={String(item.level || 'medium')}
                    description={item.description || undefined}
                    meta={formatLinkedStatus(item.status)}
                  />
                ))
              ) : (
                <LinkedEmptyState text="暂无联动风险。" />
              )}
            </div>
          </LinkedBundleSection>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">结构维护</h4>
            </div>
            <Badge variant="outline">{dependencies.length}</Badge>
          </div>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <select
              value={dependencyTargetId}
              onChange={(event) => setDependencyTargetId(event.target.value)}
              disabled={!canMutate}
              className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              data-testid="acceptance-dependency-target"
            >
              {dependencyOptions.length === 0 ? (
                <option value="">暂无可选前置</option>
              ) : (
                dependencyOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))
              )}
            </select>
            <Button
              type="button"
              className="shrink-0 gap-2"
              disabled={!canMutate || !dependencyTargetId || mutatingDependency}
              onClick={() => void handleDependencyAdd()}
              data-testid="acceptance-add-dependency"
            >
              <Plus className="h-4 w-4" />
              {mutatingDependency ? '保存中...' : '添加前置'}
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            {upstreamDependencies.length > 0 ? upstreamDependencies.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">
                    {planLookup.get(item.source_plan_id)?.name || item.source_plan_id}
                  </div>
                  <div className="text-xs text-slate-500">
                    {planLookup.get(item.target_plan_id)?.name || item.target_plan_id}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={!canMutate || mutatingDependency}
                  onClick={() => void handleDependencyRemove(item.source_plan_id)}
                  data-testid={`acceptance-remove-dependency-${item.id}`}
                >
                  移除
                </Button>
              </div>
            )) : <LinkedEmptyState text="暂无前置依赖，可在此维护。" />}
          </div>

          <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3" data-testid="acceptance-parallel-group-panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">并行组</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {currentParallelGroupId ? `当前组：${currentParallelGroupId}` : '当前节点未加入并行组'}
                </div>
              </div>
              {currentParallelGroupId ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canMutate || mutatingParallelGroup}
                  onClick={() => void handleExitParallelGroup()}
                  data-testid="acceptance-exit-parallel-group"
                >
                  退出并行组
                </Button>
              ) : null}
            </div>

            <div className="mt-3 grid gap-2">
              {currentParallelGroupMembers.length > 0 ? currentParallelGroupMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-xl border border-indigo-100 bg-white px-3 py-2 text-sm">
                  <span className="truncate font-medium text-slate-800">{member.name}</span>
                  <Badge variant="outline" className="shrink-0">{member.status}</Badge>
                </div>
              )) : (
                <LinkedEmptyState text={currentParallelGroupId ? '当前组暂无其他节点。' : '加入或创建并行组后，将在这里展示组内其他节点。'} />
              )}
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
              <select
                value={parallelGroupTargetId}
                onChange={(event) => setParallelGroupTargetId(event.target.value)}
                disabled={!canMutate || parallelGroupOptions.length === 0}
                className="min-w-0 rounded-md border border-indigo-100 bg-white px-3 py-2 text-sm text-slate-900"
                data-testid="acceptance-parallel-group-select"
              >
                {parallelGroupOptions.length === 0 ? (
                  <option value="">暂无已有并行组</option>
                ) : (
                  parallelGroupOptions.map((group) => (
                    <option key={group.groupId} value={group.groupId} disabled={group.groupId === currentParallelGroupId}>
                      {group.groupId}（{group.members.length}项）
                    </option>
                  ))
                )}
              </select>
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={!canMutate || !parallelGroupTargetId || mutatingParallelGroup}
                onClick={() => void handleJoinParallelGroup(parallelGroupTargetId)}
                data-testid="acceptance-join-parallel-group"
              >
                {mutatingParallelGroup ? '保存中...' : '加入并行组'}
              </Button>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
              <input
                value={parallelGroupDraft}
                onChange={(event) => setParallelGroupDraft(event.target.value)}
                disabled={!canMutate}
                className="min-w-0 rounded-md border border-indigo-100 bg-white px-3 py-2 text-sm text-slate-900"
                placeholder="新并行组编号，可留空自动生成"
                data-testid="acceptance-new-parallel-group-input"
              />
              <Button
                type="button"
                className="shrink-0"
                disabled={!canMutate || mutatingParallelGroup}
                onClick={() => {
                  const fallbackGroupId = `PG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${currentNodeId.slice(0, 4) || 'new'}`
                  void handleJoinParallelGroup(parallelGroupDraft || fallbackGroupId)
                }}
                data-testid="acceptance-create-parallel-group"
              >
                {mutatingParallelGroup ? '保存中...' : '创建并加入'}
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-4">
          {['inspecting', 'rectifying'].includes(node.status) && (
            <Button className="gap-2 bg-green-600 hover:bg-green-500" disabled={!canMutate || changingStatus} onClick={() => void handleStatusChange('passed')}>
              <CheckCircle2 className="h-4 w-4" />
              {changingStatus ? '提交中...' : '标记通过'}
            </Button>
          )}
          {node.status === 'submitted' && (
            <Button variant="outline" className="gap-2" disabled={!canMutate || changingStatus} onClick={() => void handleStatusChange('inspecting')}>
              <ArrowRight className="h-4 w-4" />
              {changingStatus ? '提交中...' : '开始验收'}
            </Button>
          )}
          {node.status === 'draft' && (
            <Button variant="outline" className="gap-2" disabled={!canMutate || changingStatus} onClick={() => void handleStatusChange('preparing')}>
              <ArrowRight className="h-4 w-4" />
              {changingStatus ? '提交中...' : '开始准备'}
            </Button>
          )}
          {node.status === 'ready_to_submit' && (
            <div className="flex flex-col gap-1">
              <Button
                variant="outline"
                className="gap-2"
                disabled={!canMutate || !canSubmitDeclaration}
                title={submitBlockedReason ?? undefined}
                onClick={() => void handleStatusChange('submitted')}
              >
                <ArrowRight className="h-4 w-4" />
                {changingStatus ? '提交中...' : '提交申报'}
              </Button>
              {!canSubmitDeclaration && submitBlockedReason && (
                <p className="text-xs text-amber-600">{submitBlockedReason}</p>
              )}
            </div>
          )}
          {node.status === 'rectifying' && (
            <Button variant="outline" className="gap-2" disabled={!canMutate || changingStatus} onClick={() => void handleStatusChange('ready_to_submit')}>
              <ArrowRight className="h-4 w-4" />
              {changingStatus ? '提交中...' : '回到待申报'}
            </Button>
          )}
          {node.status === 'passed' && (
            <Button variant="outline" className="gap-2" disabled={!canMutate || changingStatus} onClick={() => void handleStatusChange('archived')}>
              <CheckCircle2 className="h-4 w-4" />
              {changingStatus ? '提交中...' : '标记已归档'}
            </Button>
          )}
          <Button
            variant="outline"
            className="gap-2 text-amber-700 border-amber-200 hover:bg-amber-50"
            disabled={!canMutate || escalatingIssue}
            onClick={async () => {
              setEscalatingIssue(true)
              try {
                await apiPost('/api/issues', {
                  project_id: projectId,
                  title: `验收节点问题：${node.name}`,
                  description: `验收节点 ${node.name} 存在问题，需跟进处理。`,
                  source_type: 'acceptance',
                  source_entity_id: node.id,
                  source_entity_type: 'acceptance_plan',
                  status: 'open',
                  priority: 2,
                })
              } finally {
                setEscalatingIssue(false)
              }
            }}
            data-testid="acceptance-escalate-issue"
          >
            <AlertTriangle className="h-4 w-4" />
            {escalatingIssue ? '升级中...' : '升级为问题'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function normalizeLookupValue(value?: string | null) {
  return String(value ?? '').trim().toLowerCase()
}

function getAcceptancePlanLookup(plan: AcceptanceNode, allPlans: AcceptancePlan[]) {
  const planRow = allPlans.find((item) => item.id === plan.id)
  const taskKeys = new Set(
    [plan.id, planRow?.milestone_id]
      .map((item) => String(item ?? '').trim())
      .filter(Boolean),
  )

  return {
    planId: String(plan.id),
    taskKeys,
  }
}

function matchesAcceptanceSoftLink(
  candidate: {
    task_id?: string | null
    source_id?: string | null
    source_entity_type?: string | null
    source_entity_id?: string | null
  },
  lookup: ReturnType<typeof getAcceptancePlanLookup>,
) {
  const taskId = normalizeLookupValue(candidate.task_id)
  const sourceId = normalizeLookupValue(candidate.source_id)
  const sourceEntityType = normalizeLookupValue(candidate.source_entity_type)
  const sourceEntityId = normalizeLookupValue(candidate.source_entity_id)
  const planId = normalizeLookupValue(lookup.planId)

  return (
    (taskId && [...lookup.taskKeys].map((item) => item.toLowerCase()).includes(taskId))
    || sourceId === planId
    || (
      sourceEntityId === planId
      && (!sourceEntityType || sourceEntityType === 'acceptance_plan')
    )
  )
}

function filterLinkedWarnings(
  plan: AcceptanceNode,
  allPlans: AcceptancePlan[],
  bundle: AcceptancePlanRelationBundle | null,
): AcceptanceLinkedWarning[] {
  const lookup = getAcceptancePlanLookup(plan, allPlans)
  return (bundle?.linkedWarnings || []).filter((warning) => {
    const taskId = normalizeLookupValue(warning.task_id)
    return Boolean(taskId && [...lookup.taskKeys].map((item) => item.toLowerCase()).includes(taskId))
  })
}

function filterLinkedIssues(
  plan: AcceptanceNode,
  allPlans: AcceptancePlan[],
  bundle: AcceptancePlanRelationBundle | null,
): AcceptanceLinkedIssue[] {
  const lookup = getAcceptancePlanLookup(plan, allPlans)
  return (bundle?.linkedIssues || []).filter((issue) => matchesAcceptanceSoftLink(issue, lookup))
}

function filterLinkedRisks(
  plan: AcceptanceNode,
  allPlans: AcceptancePlan[],
  bundle: AcceptancePlanRelationBundle | null,
  linkedIssues: AcceptanceLinkedIssue[],
): AcceptanceLinkedRisk[] {
  const lookup = getAcceptancePlanLookup(plan, allPlans)
  const linkedIssueIds = new Set(linkedIssues.map((issue) => issue.id))

  return (bundle?.linkedRisks || []).filter((risk) => (
    matchesAcceptanceSoftLink(risk, lookup)
    || Boolean(risk.linked_issue_id && linkedIssueIds.has(risk.linked_issue_id))
  ))
}

function LinkedBundleSection(
  props: React.HTMLAttributes<HTMLDivElement> & {
    title: string
    subtitle: string
  },
) {
  const { title, subtitle, children, ...rest } = props
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" {...rest}>
      <div className="mb-3 space-y-1">
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function LinkedEmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
      {text}
    </div>
  )
}

function CompactPanel({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
      <span className="text-sm text-slate-600">{label}</span>
      <Badge variant="secondary">{count}</Badge>
    </div>
  )
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  )
}

function LinkedRow({
  title,
  subtitle,
  description,
  meta,
}: {
  title: string
  subtitle?: string
  description?: string | null
  meta?: string | null
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="truncate text-sm font-medium text-slate-900">{title}</div>
          {subtitle ? <div className="text-xs text-slate-500">{subtitle}</div> : null}
        </div>
        {meta ? (
          <Badge variant="outline" className="shrink-0">
            {meta}
          </Badge>
        ) : null}
      </div>
      {description ? <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p> : null}
    </div>
  )
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 font-medium text-slate-900">{value}</div>
    </div>
  )
}
