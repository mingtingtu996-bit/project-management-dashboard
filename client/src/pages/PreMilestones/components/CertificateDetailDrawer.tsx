import type { ReactNode } from 'react'
import { translateSourceType } from '@/lib/lineagePresentation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Building2, CheckCircle2, CircleAlert, ClipboardList, FileInput, FileOutput, GitBranch, Users } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/ui/status-badge'
import { useDialogFocusRestore } from '@/hooks/useDialogFocusRestore'
import { createEmptyConditionForm } from '../constants'
import { ConditionsDialog } from './ConditionsDialog'
import { CertificateDependencyMatrix } from './CertificateDependencyMatrix'
import { CertificateDependenciesDialog } from './CertificateDependenciesDialog'
import { PreMilestoneDependenciesDialog } from './PreMilestoneDependenciesDialog'
import type {
  CertificateBoardItem,
  CertificateDetailResponse,
  CertificateLinkedIssue,
  CertificateLinkedRisk,
  CertificateLinkedWarning,
  CertificateTemplateMaterialEvidenceChain,
  CertificateTemplateHandlingStep,
  ConditionFormData,
  PreMilestoneCondition,
  PreMilestone,
} from '../types'
import {
  getCertificateStatusThemeKey,
  getCertificateTypeLabel,
  mapCertificateStatusLabel,
  certificateStageBadge,
} from '../constants'

interface CertificateDetailDrawerProps {
  open: boolean
  detail: CertificateDetailResponse | null
  onClose: () => void
  onSelectCertificate: (certificateId: string) => void
  onSelectWorkItem: (workItemId: string) => void
  onSubmitCondition: (payload: {
    conditionId: string | null
    preMilestoneId: string
    form: ConditionFormData
  }) => Promise<void> | void
  onUpdateConditionStatus: (conditionId: string, status: string) => Promise<void> | void
  onDeleteCondition: (conditionId: string) => Promise<void> | void
  onEscalateIssue: (workItemId?: string | null) => void | Promise<void>
  onEscalateRisk: (workItemId?: string | null) => void | Promise<void>
  onCreateCertificateDependency: (payload: {
    predecessor_type: 'certificate' | 'work_item'
    predecessor_id: string
    successor_type: 'certificate' | 'work_item'
    successor_id: string
    dependency_kind: 'hard' | 'soft'
    notes?: string | null
  }) => Promise<void> | void
  onDeleteCertificateDependency: (dependencyId: string) => Promise<void> | void
  escalatingIssue?: boolean
  escalatingRisk?: boolean
  selectedCertificateId?: string | null
  selectedWorkItemId?: string | null
  projectId?: string | null
  certificates?: CertificateBoardItem[]
  handlingSteps?: CertificateTemplateHandlingStep[]
  materialEvidenceChains?: CertificateTemplateMaterialEvidenceChain[]
  canEdit?: boolean
}

const WARNING_LEVEL_LABEL: Record<CertificateLinkedWarning['warning_level'], string> = {
  info: '提示',
  warning: '关注',
  critical: '严重',
}

const RECORD_TYPE_LABEL: Record<string, string> = {
  status_change: '状态变更',
  supplement_required: '补正记录',
  condition_satisfied: '条件满足',
  blocked: '阻塞记录',
  unblocked: '解除阻塞',
  note: '跟进记录',
}

const ISSUE_SEVERITY_LABEL: Record<CertificateLinkedIssue['severity'], string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重',
}

const ISSUE_STATUS_LABEL: Record<CertificateLinkedIssue['status'], string> = {
  open: '待处理',
  investigating: '处理中',
  resolved: '已解决',
  closed: '已关闭',
}

const RISK_LEVEL_LABEL: Record<CertificateLinkedRisk['level'], string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重',
}

const RISK_STATUS_LABEL: Record<CertificateLinkedRisk['status'], string> = {
  identified: '已识别',
  mitigating: '处理中',
  closed: '已关闭',
}

function joinFooter(parts: Array<string | null | undefined>) {
  return parts.filter((value): value is string => Boolean(value && String(value).trim())).join(' · ')
}

function blockingLevelLabel(level: CertificateTemplateHandlingStep['blockingLevel']) {
  if (level === 'startup_gate') return '开工门槛'
  if (level === 'certificate_gate') return '办证门槛'
  return '配套成果'
}

type HandlingStepJudgementStatus = 'completed' | 'blocked' | 'in_progress' | 'not_generated'

interface HandlingStepJudgement {
  step: CertificateTemplateHandlingStep
  status: HandlingStepJudgementStatus
  statusLabel: string
  matchedWorkItems: CertificateDetailResponse['workItems']
  pendingMaterials: string[]
}

const HANDLING_COMPLETED_STATUSES = new Set(['completed', 'approved', 'issued'])
const HANDLING_BLOCKED_STATUSES = new Set(['blocked', 'supplement_required', 'expired'])

function resolveHandlingStepJudgement(
  step: CertificateTemplateHandlingStep,
  workItems: CertificateDetailResponse['workItems'],
): HandlingStepJudgement {
  const materialCodes = new Set(step.satisfiesMaterialCodes.map((code) => code.trim()).filter(Boolean))
  const matchedWorkItems = workItems.filter((item) => item.item_code && materialCodes.has(item.item_code))
  const matchedCodes = new Set(matchedWorkItems.map((item) => item.item_code).filter(Boolean))
  const pendingMaterials = step.satisfiesMaterials.filter((_, index) => {
    const code = step.satisfiesMaterialCodes[index]
    return code ? !matchedCodes.has(code) : matchedWorkItems.length === 0
  })

  if (matchedWorkItems.length === 0) {
    return {
      step,
      status: 'not_generated',
      statusLabel: '未生成事项',
      matchedWorkItems,
      pendingMaterials,
    }
  }

  if (matchedWorkItems.some((item) => item.is_blocked || HANDLING_BLOCKED_STATUSES.has(String(item.status)))) {
    return {
      step,
      status: 'blocked',
      statusLabel: '有阻塞',
      matchedWorkItems,
      pendingMaterials,
    }
  }

  if (matchedWorkItems.every((item) => HANDLING_COMPLETED_STATUSES.has(String(item.status)))) {
    return {
      step,
      status: 'completed',
      statusLabel: '已完成',
      matchedWorkItems,
      pendingMaterials,
    }
  }

  return {
    step,
    status: 'in_progress',
    statusLabel: '需推进',
    matchedWorkItems,
    pendingMaterials,
  }
}

function handlingJudgementBadgeClass(status: HandlingStepJudgementStatus) {
  if (status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (status === 'blocked') return 'border-rose-200 bg-rose-50 text-rose-700 ring-rose-200'
  if (status === 'not_generated') return 'border-slate-200 bg-slate-50 text-slate-600 ring-slate-200'
  return 'border-amber-200 bg-amber-50 text-amber-700 ring-amber-200'
}

function handlingJudgementAccentClass(status: HandlingStepJudgementStatus) {
  if (status === 'completed') return 'border-l-emerald-500'
  if (status === 'blocked') return 'border-l-rose-500'
  if (status === 'not_generated') return 'border-l-slate-300'
  return 'border-l-amber-500'
}

function LinkedCard({
  title,
  description,
  footer,
  badges,
}: {
  title: string
  description?: string | null
  footer?: string | null
  badges?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-slate-900">{title}</div>
          {description ? <div className="mt-1 text-xs leading-5 text-slate-600">{description}</div> : null}
          {footer ? <div className="mt-1 text-xs text-slate-500">{footer}</div> : null}
        </div>
        {badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
      </div>
    </div>
  )
}

function LinkedSection({
  title,
  count,
  testId,
  actionHref,
  actionLabel,
  emptyText,
  children,
}: {
  title: string
  count: number
  testId: string
  actionHref?: string | null
  actionLabel?: string
  emptyText: string
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-[var(--el-1)]" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
          <p className="mt-1 text-xs text-slate-500">{emptyText}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{count} 条</span>
          {actionHref ? (
            <Button asChild variant="outline" size="sm">
              <Link to={actionHref}>{actionLabel || '前往风险与问题'}</Link>
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid gap-2">{children}</div>
    </section>
  )
}

export function CertificateDetailDrawer({
  open,
  detail,
  onClose,
  onSelectCertificate,
  onSelectWorkItem,
  onSubmitCondition,
  onUpdateConditionStatus,
  onDeleteCondition,
  onEscalateIssue,
  onEscalateRisk,
  onCreateCertificateDependency,
  onDeleteCertificateDependency,
  escalatingIssue = false,
  escalatingRisk = false,
  selectedCertificateId,
  selectedWorkItemId,
  projectId,
  certificates = [],
  handlingSteps = [],
  materialEvidenceChains = [],
  canEdit = true,
}: CertificateDetailDrawerProps) {
  useDialogFocusRestore(open)
  const workItemsSectionRef = useRef<HTMLDivElement>(null)
  const [conditionDialogOpen, setConditionDialogOpen] = useState(false)
  const [certificateDependenciesOpen, setCertificateDependenciesOpen] = useState(false)
  const [preMilestoneDependenciesOpen, setPreMilestoneDependenciesOpen] = useState(false)
  const [conditionForm, setConditionForm] = useState<ConditionFormData>(() => createEmptyConditionForm())
  const [editingConditionId, setEditingConditionId] = useState<string | null>(null)
  const riskHubHref = projectId ? `/projects/${projectId}/risks` : null
  const linkedWarnings = detail?.linkedWarnings || []
  const linkedIssues = detail?.linkedIssues || []
  const linkedRisks = detail?.linkedRisks || []
  const certificateConditions = detail?.conditions || []
  const siblingCertificates = certificates.filter((item) => item.id !== detail?.certificate.id)
  const selectedWorkItem = detail?.workItems.find((item) => item.id === selectedWorkItemId) || null
  const escalationTargetLabel = selectedWorkItem?.item_name || detail?.certificate.certificate_name || '当前证照'
  const escalationTargetHint = selectedWorkItem
    ? '当前会把选中的办理事项软链接到问题 / 风险主链。'
    : '当前会把证照卡点软链接到问题 / 风险主链。'
  const certificateHandlingSteps = useMemo(() => {
    const certificateType = String(detail?.certificate.certificate_type ?? '')
    if (!certificateType) return []
    return handlingSteps
      .filter((step) => step.certificateType === certificateType)
      .sort((left, right) => left.sortOrder - right.sortOrder)
  }, [detail?.certificate.certificate_type, handlingSteps])
  const handlingStepJudgements = useMemo(() => {
    if (!detail) return []
    return certificateHandlingSteps.map((step) => resolveHandlingStepJudgement(step, detail.workItems))
  }, [certificateHandlingSteps, detail])
  const handlingJudgementSummary = useMemo(() => ({
    completed: handlingStepJudgements.filter((item) => item.status === 'completed').length,
    inProgress: handlingStepJudgements.filter((item) => item.status === 'in_progress').length,
    blocked: handlingStepJudgements.filter((item) => item.status === 'blocked').length,
    notGenerated: handlingStepJudgements.filter((item) => item.status === 'not_generated').length,
  }), [handlingStepJudgements])
  const certificateMaterialEvidenceChains = useMemo(() => {
    const certificateType = String(detail?.certificate.certificate_type ?? '')
    if (!certificateType) return []
    return materialEvidenceChains.filter((chain) => chain.certificateType === certificateType)
  }, [detail?.certificate.certificate_type, materialEvidenceChains])
  const coveredMaterialEvidenceCount = useMemo(() => {
    if (!detail) return 0
    return certificateMaterialEvidenceChains.filter((chain) =>
      detail.workItems.some((item) =>
        item.item_code &&
        chain.linkedWorkItemCodes.includes(item.item_code) &&
        !item.is_blocked &&
        HANDLING_COMPLETED_STATUSES.has(String(item.status)),
      ),
    ).length
  }, [certificateMaterialEvidenceChains, detail])
  const conditionMilestone = useMemo<PreMilestone | null>(() => {
    if (!detail) return null
    const now = detail.certificate.latest_record_at || new Date().toISOString()
    return {
      id: detail.certificate.id,
      project_id: projectId || '',
      milestone_type: String(detail.certificate.certificate_type || 'certificate'),
      name: detail.certificate.certificate_name,
      description: detail.certificate.block_reason || undefined,
      status: detail.certificate.status as PreMilestone['status'],
      lead_unit: detail.certificate.approving_authority || undefined,
      planned_start_date: detail.certificate.next_action_due_date || undefined,
      planned_end_date: detail.certificate.planned_finish_date || undefined,
      actual_start_date: undefined,
      actual_end_date: detail.certificate.actual_finish_date || undefined,
      responsible_user_id: undefined,
      sort_order: 0,
      notes: detail.certificate.next_action || undefined,
      certificate_no: detail.certificate.document_no || undefined,
      created_by: undefined,
      created_at: now,
      updated_at: now,
    } as PreMilestone
  }, [detail, projectId])

  useEffect(() => {
    if (open) return
    setConditionDialogOpen(false)
    setCertificateDependenciesOpen(false)
    setPreMilestoneDependenciesOpen(false)
    handleCancelEditCondition()
  }, [open])

  const handleOpenConditionsDialog = () => {
    if (!canEdit) return
    setEditingConditionId(null)
    setConditionForm(createEmptyConditionForm())
    setConditionDialogOpen(true)
  }

  const handleStartEditCondition = (condition: PreMilestoneCondition) => {
    if (!canEdit) return
    setEditingConditionId(condition.id)
    setConditionForm({
      condition_type: condition.condition_type || '',
      condition_name: condition.condition_name || '',
      description: condition.description || '',
      target_date: condition.target_date || condition.due_date || '',
    })
    setConditionDialogOpen(true)
  }

  const handleCancelEditCondition = () => {
    setEditingConditionId(null)
    setConditionForm(createEmptyConditionForm())
  }

  const handleSubmitCondition = async () => {
    if (!canEdit) return
    if (!conditionMilestone) return
    await onSubmitCondition({
      conditionId: editingConditionId,
      preMilestoneId: conditionMilestone.id,
      form: conditionForm,
    })
    setConditionDialogOpen(false)
    handleCancelEditCondition()
  }

  const handleUpdateConditionStatus = async (conditionId: string, status: string) => {
    if (!canEdit) return
    await onUpdateConditionStatus(conditionId, status)
  }

  const handleDeleteCondition = async (conditionId: string) => {
    if (!canEdit) return
    await onDeleteCondition(conditionId)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}>
        <DialogContent
          closeLabel="关闭证照详情抽屉"
          data-testid="certificate-detail-drawer"
          className="left-auto right-0 top-0 h-full max-h-none w-full max-w-[45rem] translate-x-0 translate-y-0 rounded-none border-l border-slate-200 bg-white p-0 shadow-[var(--el-4)] data-[state=open]:slide-in-from-right-0"
        >
          <div className="flex h-full flex-col">
        <DialogHeader className="flex shrink-0 items-start justify-between gap-4 px-6 py-4 pr-16 text-left" data-testid="certificate-detail-header">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="truncate text-base font-semibold text-slate-900">{detail?.certificate.certificate_name || '证照详情'}</DialogTitle>
              {detail ? (
                <StatusBadge status={getCertificateStatusThemeKey(detail.certificate.status)} fallbackLabel={mapCertificateStatusLabel(detail.certificate.status)} className="px-2 py-1 text-xs">
                  {mapCertificateStatusLabel(detail.certificate.status)}
                </StatusBadge>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
            </p>
            <DialogDescription>查看证照当前阶段、条件清单、共享事项，以及关联的预警、风险和问题。</DialogDescription>
          </div>
        </DialogHeader>
        <Separator />

        <div className="flex-1 overflow-y-auto px-6 py-4" data-testid="certificate-detail-body">
        {!detail ? (
          <div className="rounded-xl empty-state-frame border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
          </div>
        ) : (
          <div className="grid gap-4">
            <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-[var(--el-1)]" data-testid="certificate-detail-basic-info">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{detail.certificate.certificate_name}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge status={getCertificateStatusThemeKey(detail.certificate.status)} fallbackLabel={mapCertificateStatusLabel(detail.certificate.status)} className="px-2 py-1 text-xs">
                      {mapCertificateStatusLabel(detail.certificate.status)}
                    </StatusBadge>
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${certificateStageBadge(detail.certificate.current_stage)}`}>
                      {detail.certificate.current_stage}
                    </span>
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>审批部门：{detail.certificate.approving_authority || '待补充'}</div>
                  <div className="mt-1">更新时间：{detail.certificate.latest_record_at || '待补充'}</div>
                </div>
              </div>
              <div className="mt-4 grid gap-4 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3 num-mono">计划完成：{detail.certificate.planned_finish_date || '待补充'}</div>
                <div className="rounded-xl bg-slate-50 p-3 num-mono">实际完成：{detail.certificate.actual_finish_date || '待补充'}</div>
                <div className="rounded-xl bg-slate-50 p-3">下一动作：{detail.certificate.next_action || '待补充'}</div>
                <div className="rounded-xl bg-slate-50 p-3">阻塞原因：{detail.certificate.block_reason || '无'}</div>
                {detail.certificate.document_no && (
                  <div className="rounded-xl bg-slate-50 p-3">证件文号：{detail.certificate.document_no}</div>
                )}
                {detail.certificate.issuing_authority && (
                  <div className="rounded-xl bg-slate-50 p-3">发证机关：{detail.certificate.issuing_authority}</div>
                )}
              </div>
            </section>

            {certificateHandlingSteps.length > 0 ? (
              <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-[var(--el-1)]" data-testid="certificate-detail-handling-path">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <GitBranch className="h-4 w-4 text-blue-600" />
                      办证执行路径
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      按资料来源、办理部门、取得成果和后续复用关系核验证照办理深度。
                    </p>
                  </div>
                  <Badge variant="outline">{certificateHandlingSteps.length} 步</Badge>
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="certificate-detail-handling-summary">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <ClipboardList className="h-3.5 w-3.5 text-blue-600" />
                    办理判断总览
                  </div>
                  <div className="grid gap-2 sm:grid-cols-4">
                    <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
                      <div className="text-xs text-slate-500">已完成</div>
                      <div className="mt-1 text-base font-semibold tabular-nums text-emerald-700">已完成 {handlingJudgementSummary.completed}</div>
                    </div>
                    <div className="rounded-lg border border-amber-100 bg-white px-3 py-2">
                      <div className="text-xs text-slate-500">需推进</div>
                      <div className="mt-1 text-base font-semibold tabular-nums text-amber-700">需推进 {handlingJudgementSummary.inProgress}</div>
                    </div>
                    <div className="rounded-lg border border-rose-100 bg-white px-3 py-2">
                      <div className="text-xs text-slate-500">有阻塞</div>
                      <div className="mt-1 text-base font-semibold tabular-nums text-rose-700">有阻塞 {handlingJudgementSummary.blocked}</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <div className="text-xs text-slate-500">未匹配</div>
                      <div className="mt-1 text-base font-semibold tabular-nums text-slate-700">未生成事项 {handlingJudgementSummary.notGenerated}</div>
                    </div>
                  </div>
                </div>

                {certificateMaterialEvidenceChains.length > 0 ? (
                  <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-3" data-testid="certificate-detail-material-evidence-chain">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-semibold text-blue-900">
                          <FileInput className="h-3.5 w-3.5 text-blue-600" />
                          资料证据链
                        </div>
                        <p className="mt-1 text-xs leading-5 text-blue-800">
                          按资料缺口对应实际事项、办理部门、拿回成果和后续复用关系核验。
                        </p>
                      </div>
                      <Badge variant="outline" className="border-blue-200 bg-white text-blue-700">
                        资料覆盖 {coveredMaterialEvidenceCount} / {certificateMaterialEvidenceChains.length}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {certificateMaterialEvidenceChains.map((chain) => (
                        <div key={`${chain.handlingStepCode}-${chain.materialCode}`} className="rounded-lg border border-blue-100 bg-white px-3 py-2">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-900">{chain.materialName}</div>
                              <div className="mt-1 text-xs leading-5 text-slate-600">
                                {chain.handlingStepName} · {chain.handlingAuthority}
                              </div>
                            </div>
                            <Badge variant={chain.blockingLevel === 'startup_gate' ? 'default' : 'outline'}>
                              {blockingLevelLabel(chain.blockingLevel)}
                            </Badge>
                          </div>
                          <div className="mt-2 grid gap-2 text-xs leading-5 text-slate-600 md:grid-cols-2">
                            <div>
                              <span className="font-medium text-slate-700">对应事项：</span>
                              {chain.linkedWorkItemNames.length > 0 ? chain.linkedWorkItemNames.join('、') : '待生成办理事项'}
                            </div>
                            <div>
                              <span className="font-medium text-slate-700">资料包：</span>
                              {chain.materialPackageNames.length > 0 ? chain.materialPackageNames.join('、') : '通用办理路径'}
                            </div>
                            <div>
                              <span className="font-medium text-slate-700">拿回成果：</span>
                              {chain.outputDocument}
                            </div>
                            <div>
                              <span className="font-medium text-slate-700">后续复用：</span>
                              {chain.reusableForCertificateTypes.length > 0
                                ? chain.reusableForCertificateTypes.map(getCertificateTypeLabel).join('、')
                                : '当前证照闭环'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3">
                  {handlingStepJudgements.map((judgement, index) => {
                    const { step } = judgement
                    return (
                    <div key={step.stepCode} className={`rounded-xl border border-l-4 border-slate-200 bg-slate-50 p-3 ${handlingJudgementAccentClass(judgement.status)}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold tabular-nums text-slate-700 ring-1 ring-inset ring-slate-200">
                            {index + 1}
                          </span>
                          <div className="min-w-0 text-sm font-semibold text-slate-900">{step.stepName}</div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline" className={handlingJudgementBadgeClass(judgement.status)}>
                            {judgement.statusLabel}
                          </Badge>
                          <Badge variant={step.blockingLevel === 'startup_gate' ? 'default' : 'outline'}>
                            {blockingLevelLabel(step.blockingLevel)}
                          </Badge>
                        </div>
                      </div>

                      <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                          {judgement.status === 'completed' ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <CircleAlert className="h-3.5 w-3.5 text-amber-600" />
                          )}
                          关联事项
                        </div>
                        {judgement.matchedWorkItems.length > 0 ? (
                          <div className="mt-2 grid gap-2">
                            {judgement.matchedWorkItems.map((item) => (
                              <div key={item.id} className="rounded-lg bg-slate-50 px-3 py-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-sm font-medium text-slate-900">{item.item_name}</div>
                                  <StatusBadge status={getCertificateStatusThemeKey(item.status)} fallbackLabel={mapCertificateStatusLabel(item.status)} className="px-2 py-0.5 text-xs">
                                    {mapCertificateStatusLabel(item.status)}
                                  </StatusBadge>
                                </div>
                                <div className="mt-1 text-xs leading-5 text-slate-500">
                                  {item.next_action || '待补充下一动作'}
                                  {item.block_reason ? ` · ${item.block_reason}` : ''}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                            暂未匹配实际事项{judgement.pendingMaterials.length > 0 ? `：${judgement.pendingMaterials.join('、')}` : ''}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                            <Users className="h-3.5 w-3.5 text-slate-500" />
                            资料来源方
                          </div>
                          <div className="mt-2 text-xs leading-5 text-slate-600">{step.sourceParties.join('、')}</div>
                          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-700">
                            <FileInput className="h-3.5 w-3.5 text-slate-500" />
                            带什么资料
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {step.submitMaterials.map((material) => (
                              <Badge key={material} variant="secondary">
                                {material}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                              <Building2 className="h-3.5 w-3.5 text-slate-500" />
                              跑的部门/机构
                            </div>
                            <div className="mt-2 text-sm font-medium leading-6 text-slate-900">{step.handlingAuthority}</div>
                          </div>

                          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3">
                            <div className="flex items-center gap-2 text-xs font-semibold text-blue-700">
                              <FileOutput className="h-3.5 w-3.5" />
                              拿回成果
                            </div>
                            <div className="mt-2 text-sm font-semibold leading-6 text-blue-950">{step.outputDocument}</div>
                          </div>

                          <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 sm:col-span-2">
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                              <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                              满足/复用
                            </div>
                            <div className="mt-2 text-xs leading-5 text-slate-600">
                              补齐：{step.satisfiesMaterials.join('、')}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-slate-600">
                              {step.reusableForCertificateTypes.length > 0
                                ? `后续复用：${step.reusableForCertificateTypes.map(getCertificateTypeLabel).join('、')}`
                                : '完成施工许可闭环'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    )
                  })}
                </div>
              </section>
            ) : null}

            {siblingCertificates.length > 0 ? (
              <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-[var(--el-1)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">证照切换</h4>
                    <p className="mt-1 text-xs text-slate-500">快速跳转同项目其他证照。</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[detail.certificate, ...siblingCertificates].map((certificate) => (
                      <Button variant="ghost"
                        key={certificate.id}
                        type="button"
                        onClick={() => onSelectCertificate(certificate.id)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          selectedCertificateId === certificate.id
                            ? 'bg-blue-600 text-white'
                            : 'border border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-300 hover:text-blue-700'
                        }`}
                      >
                        {certificate.certificate_name}
                      </Button>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            <section className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
              <div className="grid gap-4">
                <div ref={workItemsSectionRef} className="rounded-xl border border-slate-100 bg-white p-5 shadow-[var(--el-1)]" data-testid="certificate-detail-linked-files">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">共享事项与依赖</h4>
                      <p className="mt-1 text-xs text-slate-500">展示当前证件受到哪些事项影响，以及这些事项还会影响哪些证件。</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => workItemsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>查看共享事项</Button>
                      {canEdit ? <Button variant="outline" size="sm" onClick={() => setCertificateDependenciesOpen(true)}>管理证照依赖</Button> : null}
                      {canEdit ? <Button variant="outline" size="sm" onClick={() => setPreMilestoneDependenciesOpen(true)}>管理前置依赖</Button> : null}
                      <Button variant="outline" size="sm" onClick={onClose}>关闭</Button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    {detail.workItems.map((item) => (
                      <Button variant="ghost"
                        key={item.id}
                        type="button"
                        onClick={() => onSelectWorkItem(item.id)}
                        className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                          selectedWorkItemId === item.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-900">{item.item_name}</span>
                          <span className="text-xs text-slate-500">{item.item_stage}</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {item.next_action || '待补充下一动作'} · {item.is_shared ? '共享事项' : '单证事项'}
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>

                <CertificateDependencyMatrix
                  rows={detail.dependencyMatrix}
                  selectedCertificateId={selectedCertificateId}
                  selectedWorkItemId={selectedWorkItemId}
                  onSelectCertificate={onSelectCertificate}
                  onSelectWorkItem={onSelectWorkItem}
                />
              </div>

              <div className="grid gap-4">
                <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-[var(--el-1)]" data-testid="certificate-detail-conditions">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-slate-900">条件清单</h4>
                    {canEdit ? (
                      <Button variant="outline" size="sm" onClick={handleOpenConditionsDialog}>
                        管理条件
                      </Button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-2">
                    {certificateConditions.length > 0 ? (
                      certificateConditions.map((condition) => (
                        <div key={condition.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-medium text-slate-900">{condition.condition_name}</div>
                            <StatusBadge
                              status={condition.is_satisfied ? 'completed' : condition.status === '未满足' ? 'warning' : 'pending'}
                              fallbackLabel={condition.status}
                              className="px-2 py-0.5 text-xs"
                            >
                              {condition.is_satisfied ? '已满足' : condition.status}
                            </StatusBadge>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {condition.condition_type}
                            {condition.responsible_person ? ` · 责任人：${condition.responsible_person}` : ''}
                            {condition.due_date ? ` · 截止：${condition.due_date}` : ''}
                          </div>
                          {condition.description ? <div className="mt-1 text-xs leading-5 text-slate-600">{condition.description}</div> : null}
                        </div>
                      ))
                    ) : (
                      <EmptyState
                        title="暂无条件清单"
                        description="补充前置条件后，可在这里查看满足状态。"
                        className="rounded-xl empty-state-frame border-slate-200 bg-slate-50 py-6"
                      />
                    )}
                  </div>
                </section>

                <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-[var(--el-1)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">升级处置</h4>
                      <p className="mt-1 text-xs text-slate-500">
                        当前对象：{escalationTargetLabel}。{escalationTargetHint}
                      </p>
                    </div>
                    {canEdit ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={escalatingIssue}
                          loading={escalatingIssue}
                          onClick={() => void onEscalateIssue(selectedWorkItem?.id || null)}
                        >
                          升级为问题
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={escalatingRisk}
                          loading={escalatingRisk}
                          onClick={() => void onEscalateRisk(selectedWorkItem?.id || null)}
                        >
                          升级为风险
                        </Button>
                      </div>
                    ) : (
                      <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                        当前为只读模式
                      </div>
                    )}
                  </div>
                  <div className="mt-3 rounded-xl empty-state-frame border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                    只复用共享问题/风险主链，通过关联记录做软链接，不在前期证照域内新增平行状态链。
                  </div>
                </section>

                <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-[var(--el-1)]">
                  <h4 className="text-sm font-semibold text-slate-900">状态记录</h4>
                  <div className="mt-3 grid gap-2">
                    {detail.records.map((record) => (
                      <div key={record.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-900">
                            {RECORD_TYPE_LABEL[record.record_type] ?? record.record_type}
                          </span>
                          <span className="text-xs text-slate-500">{record.recorded_at}</span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {record.from_status || '起点'} → {record.to_status || '未变更'}
                        </div>
                        {record.content ? <div className="mt-1 text-xs text-slate-600">{record.content}</div> : null}
                      </div>
                    ))}
                    {detail.records.length === 0 && (
                      <EmptyState
                        title="暂无状态记录"
                        description="状态变更和跟进记录会在这里留痕。"
                        className="rounded-xl empty-state-frame border-slate-200 bg-slate-50 py-6"
                      />
                    )}
                  </div>
                </section>

                <LinkedSection
                  title="联动预警"
                  count={linkedWarnings.length}
                  testId="linked-warnings"
                  actionHref={riskHubHref}
                  actionLabel="前往风险与问题"
                  emptyText="仅展示当前证照命中的预警，不进入共享底座真值层。"
                >
                  {linkedWarnings.length > 0 ? (
                    linkedWarnings.map((item) => (
                      <LinkedCard
                        key={item.id}
                        title={item.title}
                        description={item.description}
                        footer={joinFooter([
                          `任务 ${item.task_id || '未关联'}`,
                          item.is_acknowledged ? '已确认' : '未确认',
                        ])}
                        badges={<StatusBadge status={item.warning_level} className="px-2 py-0.5 text-xs">{WARNING_LEVEL_LABEL[item.warning_level]}</StatusBadge>}
                      />
                    ))
                  ) : (
                    <EmptyState
                      title="暂无联动预警"
                      description="当前证照没有命中的预警记录。"
                      className="rounded-xl empty-state-frame border-slate-200 bg-slate-50 py-6"
                    />
                  )}
                </LinkedSection>

                <LinkedSection
                  title="联动问题"
                  count={linkedIssues.length}
                  testId="linked-issues"
                  actionHref={riskHubHref}
                  actionLabel="前往风险与问题"
                  emptyText="仅展示当前证照命中的问题，不进入共享底座真值层。"
                >
                  {linkedIssues.length > 0 ? (
                    linkedIssues.map((item) => (
                      <LinkedCard
                        key={item.id}
                        title={item.title}
                        description={item.description}
                        footer={joinFooter([
                          item.task_id ? `任务 ${item.task_id}` : '未关联任务',
                          item.source_type ? translateSourceType(item.source_type) : null,
                        ])}
                        badges={
                          <>
                            <StatusBadge status={item.severity} className="px-2 py-0.5 text-xs">
                              {ISSUE_SEVERITY_LABEL[item.severity]}
                            </StatusBadge>
                            <StatusBadge status={item.status} className="px-2 py-0.5 text-xs">
                              {ISSUE_STATUS_LABEL[item.status]}
                            </StatusBadge>
                          </>
                        }
                      />
                    ))
                  ) : (
                    <EmptyState
                      title="暂无联动问题"
                      description="当前证照没有命中的问题记录。"
                      className="rounded-xl empty-state-frame border-slate-200 bg-slate-50 py-6"
                    />
                  )}
                </LinkedSection>

                <LinkedSection
                  title="联动风险"
                  count={linkedRisks.length}
                  testId="linked-risks"
                  actionHref={riskHubHref}
                  actionLabel="前往风险与问题"
                  emptyText="仅展示当前证照命中的风险，不进入共享底座真值层。"
                >
                  {linkedRisks.length > 0 ? (
                    linkedRisks.map((item) => (
                      <LinkedCard
                        key={item.id}
                        title={item.title}
                        description={item.description}
                        footer={joinFooter([
                          item.task_id ? '已关联任务' : '未关联任务',
                          item.linked_issue_id ? '已关联问题' : null,
                          item.source_type ? translateSourceType(item.source_type) : '人工创建',
                        ])}
                        badges={
                          <>
                            <StatusBadge status={item.level} className="px-2 py-0.5 text-xs">
                              {RISK_LEVEL_LABEL[item.level]}
                            </StatusBadge>
                            <StatusBadge
                              status={item.status === 'closed' ? 'closed' : item.status === 'mitigating' ? 'in_progress' : 'open'}
                              fallbackLabel={RISK_STATUS_LABEL[item.status]}
                              className="px-2 py-0.5 text-xs"
                            >
                              {RISK_STATUS_LABEL[item.status]}
                            </StatusBadge>
                          </>
                        }
                      />
                    ))
                  ) : (
                    <EmptyState
                      title="暂无联动风险"
                      description="当前证照没有命中的风险记录。"
                      className="rounded-xl empty-state-frame border-slate-200 bg-slate-50 py-6"
                    />
                  )}
                </LinkedSection>
              </div>
            </section>
          </div>
        )}
        </div>
        <Separator />
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 bg-white/95 px-6 py-4" data-testid="certificate-detail-footer">
          <div className="text-xs text-slate-500">
            {detail ? `当前阶段：${detail.certificate.current_stage}` : '请选择证照查看详情'}
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <>
                <Button variant="outline" size="sm" onClick={handleOpenConditionsDialog} disabled={!detail}>
                  编辑条件
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCertificateDependenciesOpen(true)} disabled={!detail}>
                </Button>
              </>
            ) : null}
            <Button size="sm" onClick={onClose}>关闭</Button>
          </div>
        </div>
          </div>
        </DialogContent>
      </Dialog>
      {conditionDialogOpen && conditionMilestone ? (
        <ConditionsDialog
          selectedMilestone={conditionMilestone}
          conditions={certificateConditions}
          conditionForm={conditionForm}
          setConditionForm={setConditionForm}
          editingConditionId={editingConditionId}
          onClose={() => {
            setConditionDialogOpen(false)
            handleCancelEditCondition()
          }}
          onSubmitCondition={() => void handleSubmitCondition()}
          onStartEditCondition={handleStartEditCondition}
          onCancelEditCondition={handleCancelEditCondition}
          onUpdateConditionStatus={(conditionId, status) => void handleUpdateConditionStatus(conditionId, status)}
          onDeleteCondition={(conditionId) => void handleDeleteCondition(conditionId)}
          readOnly={!canEdit}
        />
      ) : null}
      {canEdit ? (
        <>
          <CertificateDependenciesDialog
            open={certificateDependenciesOpen}
            currentCertificateId={detail?.certificate.id || selectedCertificateId || null}
            currentCertificateName={detail?.certificate.certificate_name || null}
            selectedWorkItemId={selectedWorkItemId}
            certificates={certificates}
            workItems={detail?.workItems || []}
            dependencies={detail?.dependencies || []}
            onClose={() => setCertificateDependenciesOpen(false)}
            onCreateDependency={(payload) => onCreateCertificateDependency(payload)}
            onDeleteDependency={(dependencyId) => onDeleteCertificateDependency(dependencyId)}
          />
          <PreMilestoneDependenciesDialog
            open={preMilestoneDependenciesOpen}
            projectId={projectId}
            certificates={certificates}
            currentCertificateId={detail?.certificate.id || selectedCertificateId || null}
            onClose={() => setPreMilestoneDependenciesOpen(false)}
          />
        </>
      ) : null}
    </>
  )
}
